/**
 * Context Compactor 시스템
 *
 * AI를 활용한 메시지 요약 기능
 *
 * 핵심 기능:
 * - 토큰 사용량 계산 (tiktoken 사용)
 * - context window의 n% 이상 사용 시 AI로 메시지 요약
 * - 시스템 메시지와 최근 메시지는 보존
 * - 중간 메시지들을 요약하여 압축
 */

import type { BaseMessage } from "@langchain/core/messages";
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
} from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { encoding_for_model, type TiktokenModel } from "tiktoken";
import type { SessionManager } from "../sample-02/session.js";
import type { CommandResult } from "../sample-03/commands.js";

// ========== CompactionOptions ==========

export interface CompactionOptions {
	/** Context window 크기 (토큰 수) */
	contextWindowSize: number;
	/** Compaction을 트리거하는 임계값 (0.0 ~ 1.0) */
	threshold: number;
	/** 보존할 최근 메시지 개수 */
	preserveRecentCount: number;
}

export interface CompactionResult {
	/** 압축이 실행되었는지 여부 */
	compacted: boolean;
	/** 압축 전 메시지 개수 */
	originalCount: number;
	/** 압축 후 메시지 개수 */
	compactedCount: number;
	/** 압축 전 토큰 수 (추정) */
	originalTokens: number;
	/** 압축 후 토큰 수 (추정) */
	compactedTokens: number;
	/** 압축된 메시지 배열 */
	messages: BaseMessage[];
}

// ========== ContextCompactor ==========

export class ContextCompactor {
	private options: Required<CompactionOptions>;
	private encoding: ReturnType<typeof encoding_for_model>;

	constructor(options: Partial<CompactionOptions> = {}) {
		this.options = {
			contextWindowSize: options.contextWindowSize || 128000,
			threshold: options.threshold || 0.7,
			preserveRecentCount: options.preserveRecentCount || 4,
		};

		// tiktoken 초기화
		const modelName = process.env.OPENAI_MODEL || "gpt-5";
		this.encoding = encoding_for_model(modelName as TiktokenModel);
	}

	/**
	 * 메시지 배열의 토큰 수를 계산 (tiktoken 사용)
	 *
	 * 이미지의 경우 OpenAI Vision API 토큰 계산 공식 사용:
	 * - 저해상도(detail=low): 85 토큰
	 * - 고해상도(detail=high): (width/512) * (height/512) * 170 + 85 토큰
	 * - detail 지정 안 됨: 기본적으로 고해상도로 간주하여 보수적으로 추정
	 */
	estimateTokens(messages: BaseMessage[]): number {
		let totalTokens = 0;

		for (const msg of messages) {
			// 이미지 메시지 처리
			if (typeof msg.content !== "string" && Array.isArray(msg.content)) {
				for (const item of msg.content) {
					// biome-ignore lint/suspicious/noExplicitAny: content item type varies
					const contentItem = item as any;
					if (contentItem.type === "image_url") {
						// OpenAI Vision API 토큰 계산
						// detail이 low면 85, 아니면 평균적으로 255-765 토큰
						// 정확한 계산은 이미지 크기가 필요하므로 중간값 사용
						const detail = contentItem.image_url?.detail || "auto";
						if (detail === "low") {
							totalTokens += 85;
						} else {
							// high 또는 auto: 평균적으로 512x512 이미지 기준
							// (512/512) * (512/512) * 170 + 85 = 255 토큰
							// 보수적으로 약간 높게 잡아 400 토큰으로 추정
							totalTokens += 400;
						}
					} else if (contentItem.type === "text") {
						totalTokens += this.encoding.encode(contentItem.text || "").length;
					}
				}
			} else {
				// 일반 텍스트 메시지
				const content =
					typeof msg.content === "string"
						? msg.content
						: JSON.stringify(msg.content);

				totalTokens += this.encoding.encode(content).length;
			}

			totalTokens += 4; // 메타데이터
		}

		totalTokens += 3; // 구조 오버헤드
		return totalTokens;
	}

	/**
	 * Context window 사용률 계산
	 */
	private calculateUsageRatio(messages: BaseMessage[]): number {
		const tokens = this.estimateTokens(messages);
		return tokens / this.options.contextWindowSize;
	}

	/**
	 * 메시지 배열을 압축해야 하는지 판단
	 */
	shouldCompact(messages: BaseMessage[]): boolean {
		const usageRatio = this.calculateUsageRatio(messages);
		return usageRatio >= this.options.threshold;
	}

	/**
	 * 메시지 배열을 AI를 사용하여 압축
	 *
	 * @param messages - 압축할 메시지 배열
	 * @param force - true이면 임계값 체크 없이 무조건 압축 (기본값: false)
	 */
	async compactMessages(
		messages: BaseMessage[],
		force: boolean = false,
	): Promise<CompactionResult> {
		const originalTokens = this.estimateTokens(messages);
		const usageRatio = this.calculateUsageRatio(messages);

		console.log(
			`\n📊 Context Window 사용률: ${(usageRatio * 100).toFixed(1)}%`,
		);
		console.log(
			`   추정 토큰: ${originalTokens} / ${this.options.contextWindowSize}`,
		);

		// 압축이 필요 없으면 원본 반환 (force=true이면 스킵)
		if (!force && !this.shouldCompact(messages)) {
			console.log("   ✅ 압축 불필요");
			return {
				compacted: false,
				originalCount: messages.length,
				compactedCount: messages.length,
				originalTokens,
				compactedTokens: originalTokens,
				messages,
			};
		}

		console.log(force ? "   🔄 강제 압축 시작..." : "   🔄 압축 시작...");

		// 1. 메시지 분류
		const systemMessages: BaseMessage[] = [];
		const middleMessages: BaseMessage[] = [];
		const recentMessages: BaseMessage[] = [];

		// 시스템 메시지 분리
		let nonSystemMessages = messages;
		for (let i = 0; i < messages.length; i++) {
			if (messages[i]._getType() === "system") {
				systemMessages.push(messages[i]);
			} else {
				nonSystemMessages = messages.slice(i);
				break;
			}
		}

		// 최근 메시지 분리
		if (nonSystemMessages.length > this.options.preserveRecentCount) {
			const splitIndex =
				nonSystemMessages.length - this.options.preserveRecentCount;
			middleMessages.push(...nonSystemMessages.slice(0, splitIndex));
			recentMessages.push(...nonSystemMessages.slice(splitIndex));
		} else {
			recentMessages.push(...nonSystemMessages);
		}

		// 2. 중간 메시지가 없으면 압축할 것이 없음
		if (middleMessages.length === 0) {
			console.log("   ⚠️  압축할 중간 메시지가 없음");
			return {
				compacted: false,
				originalCount: messages.length,
				compactedCount: messages.length,
				originalTokens,
				compactedTokens: originalTokens,
				messages,
			};
		}

		// 3. 중간 메시지를 AI로 요약
		console.log(`   📝 중간 메시지 요약 중... (${middleMessages.length}개)`);
		const summary = await this.summarizeMessages(middleMessages);

		// 4. 압축된 메시지 배열 생성
		const compactedMessages: BaseMessage[] = [
			...systemMessages,
			new SystemMessage(`[이전 대화 요약]\n${summary}`),
			...recentMessages,
		];

		const compactedTokens = this.estimateTokens(compactedMessages);

		console.log(`   ✅ 압축 완료!`);
		console.log(
			`      메시지: ${messages.length}개 → ${compactedMessages.length}개`,
		);
		console.log(
			`      토큰: ${originalTokens} → ${compactedTokens} (${((1 - compactedTokens / originalTokens) * 100).toFixed(1)}% 감소)`,
		);

		return {
			compacted: true,
			originalCount: messages.length,
			compactedCount: compactedMessages.length,
			originalTokens,
			compactedTokens,
			messages: compactedMessages,
		};
	}

	/**
	 * 메시지 배열을 AI로 요약
	 */
	private async summarizeMessages(messages: BaseMessage[]): Promise<string> {
		const model = new ChatOpenAI({
			modelName: process.env.OPENAI_MODEL || "gpt-5",
			temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "1"),
		});

		// 메시지를 텍스트로 변환
		let conversation = "";
		for (const msg of messages) {
			const type = msg._getType();
			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);

			let role = "Unknown";
			if (type === "human") role = "User";
			else if (type === "ai") role = "Assistant";
			else if (type === "system") role = "System";
			else if (type === "tool") role = "Tool";

			conversation += `${role}: ${content}\n\n`;
		}

		// 요약 프롬프트
		const summaryPrompt = `다음은 이전 대화 기록입니다. 이 대화의 핵심 내용을 간결하게 요약해주세요.
요약에는 다음 정보가 포함되어야 합니다:
- 사용자가 요청한 주요 작업
- 수행된 작업과 결과
- 중요한 컨텍스트나 결정사항

요약은 한국어로 작성하고, 불필요한 세부사항은 생략하세요.

대화 기록:
${conversation}

요약:`;

		const response = await model.invoke([new HumanMessage(summaryPrompt)]);

		return typeof response.content === "string"
			? response.content
			: JSON.stringify(response.content);
	}

	/**
	 * 전체 메시지를 AI로 요약 (간단 버전)
	 * /compact 명령어용
	 */
	private async summarizeAllMessages(messages: BaseMessage[]): Promise<string> {
		const model = new ChatOpenAI({
			modelName: process.env.OPENAI_MODEL || "gpt-5",
			temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "1"),
		});

		// 메시지를 텍스트로 변환 (시스템 메시지 제외)
		let conversation = "";
		for (const msg of messages) {
			const type = msg._getType();
			if (type === "system") continue; // 시스템 메시지 스킵

			const content =
				typeof msg.content === "string"
					? msg.content
					: JSON.stringify(msg.content);

			let role = "Unknown";
			if (type === "human") role = "User";
			else if (type === "ai") role = "Assistant";
			else if (type === "tool") role = "Tool";

			conversation += `${role}: ${content}\n\n`;
		}

		// 요약 프롬프트
		const summaryPrompt = `다음 대화 내역을 간결하게 요약해주세요:

${conversation}

요약:`;

		const response = await model.invoke([new HumanMessage(summaryPrompt)]);

		return typeof response.content === "string"
			? response.content
			: JSON.stringify(response.content);
	}

	/**
	 * 현재 설정 정보 반환
	 */
	getOptions(): Required<CompactionOptions> {
		return { ...this.options };
	}

	/**
	 * 설정 업데이트
	 */
	updateOptions(options: Partial<CompactionOptions>): void {
		this.options = {
			...this.options,
			...options,
		};
	}

	// ========== CommandRegistry 유틸 함수 ==========

	/**
	 * /compact 명령어 핸들러 생성
	 *
	 * commandRegistry.register("compact", compactor.handlerCompact(sessionManager))
	 * 형태로 사용 가능합니다.
	 *
	 * @param sessionManager - 세션 관리자
	 */
	handlerCompact(sessionManager: SessionManager) {
		// biome-ignore lint/suspicious/noExplicitAny: Context is dynamic
		return async (_args: string, context?: any): Promise<CommandResult> => {
			const sessionId =
				context?.sessionId || sessionManager.getCurrentSessionId();

			console.log("\n🗜️  압축 실행...");

			const messages = sessionManager.getMessages(sessionId);
			const originalCount = messages.length;

			// 1. AI에게 전체 대화 요약 요청
			console.log("   📝 AI에게 대화 요약 요청 중...");
			const summary = await this.summarizeAllMessages(messages);

			// 2. 새 메시지 배열 구성: SYSTEM + Context + 요약
			const systemMessages = messages.filter((m) => m._getType() === "system");
			const contextMessages = messages.filter(
				(m) =>
					m._getType() === "human" &&
					typeof m.content === "string" &&
					m.content.includes("cocoagent.md"),
			);

			const newMessages: BaseMessage[] = [
				...systemMessages,
				...contextMessages,
				new AIMessage(`[이전 대화 요약]\n${summary}`),
			];

			// 3. 세션 덮어쓰기
			sessionManager.replaceMessages(newMessages, sessionId);

			const newCount = newMessages.length;
			const originalTokens = this.estimateTokens(messages);
			const newTokens = this.estimateTokens(newMessages);

			console.log("✅ 압축 완료");
			console.log(`   메시지: ${originalCount}개 → ${newCount}개`);
			console.log(`   토큰: ${originalTokens} → ${newTokens}`);
			console.log(
				`   감소율: ${((1 - newTokens / originalTokens) * 100).toFixed(1)}%`,
			);

			return { type: "executed" }; // 실행 완료, 다시 입력 대기
		};
	}

	/**
	 * /status 명령어 핸들러 생성
	 *
	 * commandRegistry.register("status", compactor.handlerStatus(sessionManager))
	 * 형태로 사용 가능합니다.
	 *
	 * @param sessionManager - 세션 관리자
	 */
	handlerStatus(sessionManager: SessionManager) {
		// biome-ignore lint/suspicious/noExplicitAny: Context is dynamic
		return async (_args: string, context?: any): Promise<CommandResult> => {
			const sessionId =
				context?.sessionId || sessionManager.getCurrentSessionId();

			const messages = sessionManager.getMessages(sessionId);
			const tokens = this.estimateTokens(messages);
			const ratio = (tokens / this.options.contextWindowSize) * 100;

			console.log("\n📊 세션 상태:");
			console.log(`   메시지: ${messages.length}개`);
			console.log(`   토큰: ${tokens} / ${this.options.contextWindowSize}`);
			console.log(`   사용률: ${ratio.toFixed(1)}%`);
			console.log(
				`   압축 임계값: ${(this.options.threshold * 100).toFixed(0)}%`,
			);

			if (ratio >= this.options.threshold * 100) {
				console.log("   ⚠️  압축 권장");
			} else {
				console.log("   ✅ 정상");
			}

			return { type: "executed" }; // 실행 완료, 다시 입력 대기
		};
	}
}
