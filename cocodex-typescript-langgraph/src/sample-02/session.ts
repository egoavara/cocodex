/**
 * 공통 Session Manager 시스템
 *
 * 채팅 세션 및 메시지 관리
 *
 * 핵심 기능:
 * - 다중 세션 관리
 * - 메시지 히스토리 관리
 * - 세션별 메타데이터
 * - 파일 저장/로드 (.cocodex/sessions/)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BaseMessage } from "@langchain/core/messages";
import {
	AIMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";

// ========== Session 타입 정의 ==========

export interface SessionMetadata {
	createdAt: Date;
	updatedAt: Date;
	userId?: string;
	context?: Record<string, unknown>;
}

export interface Session {
	id: string;
	messages: BaseMessage[];
	metadata: SessionMetadata;
}

// ========== SessionManager ==========

export class SessionManager {
	private sessions: Map<string, Session> = new Map();
	private currentSessionId: string | null = null;
	private sessionsDir: string;

	constructor(sessionsDir: string = ".cocodex/sessions") {
		this.sessionsDir = sessionsDir;
	}

	// 새 세션 생성
	createSession(
		sessionId?: string,
		metadata?: Partial<SessionMetadata>,
	): string {
		const id = sessionId || this.generateSessionId();

		const session: Session = {
			id,
			messages: [],
			metadata: {
				createdAt: new Date(),
				updatedAt: new Date(),
				...metadata,
			},
		};

		this.sessions.set(id, session);
		this.currentSessionId = id;

		console.log(`  ✅ 세션 생성: ${id}`);
		return id;
	}

	// 세션 ID 생성
	private generateSessionId(): string {
		return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	// 현재 세션 설정
	setCurrentSession(sessionId: string): boolean {
		if (!this.sessions.has(sessionId)) {
			console.log(`  ❌ 세션 없음: ${sessionId}`);
			return false;
		}
		this.currentSessionId = sessionId;
		return true;
	}

	// 현재 세션 ID 반환
	getCurrentSessionId(): string | null {
		return this.currentSessionId;
	}

	// 세션 가져오기
	getSession(sessionId?: string): Session | null {
		const id = sessionId || this.currentSessionId;
		if (!id) {
			return null;
		}
		return this.sessions.get(id) || null;
	}

	// 현재 세션의 메시지 추가
	addMessage(message: BaseMessage, sessionId?: string): void {
		const id = sessionId || this.currentSessionId;
		if (!id) {
			throw new Error("활성 세션이 없습니다");
		}

		const session = this.sessions.get(id);
		if (!session) {
			throw new Error(`세션을 찾을 수 없습니다: ${id}`);
		}

		session.messages.push(message);
		session.metadata.updatedAt = new Date();
	}

	// 현재 세션의 여러 메시지 추가
	addMessages(messages: BaseMessage[], sessionId?: string): void {
		for (const message of messages) {
			this.addMessage(message, sessionId);
		}
	}

	// 현재 세션의 메시지 전체 대치
	replaceMessages(messages: BaseMessage[], sessionId?: string): void {
		const id = sessionId || this.currentSessionId;
		if (!id) {
			throw new Error("활성 세션이 없습니다");
		}

		const session = this.sessions.get(id);
		if (!session) {
			throw new Error(`세션을 찾을 수 없습니다: ${id}`);
		}

		session.messages = messages;
		session.metadata.updatedAt = new Date();
	}

	// 현재 세션의 메시지 가져오기
	getMessages(sessionId?: string): BaseMessage[] {
		const session = this.getSession(sessionId);
		return session ? session.messages : [];
	}

	// 현재 세션의 메시지 개수
	getMessageCount(sessionId?: string): number {
		return this.getMessages(sessionId).length;
	}

	// 현재 세션의 마지막 N개 메시지
	getLastMessages(count: number, sessionId?: string): BaseMessage[] {
		const messages = this.getMessages(sessionId);
		return messages.slice(-count);
	}

	// 현재 세션 초기화
	clearSession(sessionId?: string): void {
		const id = sessionId || this.currentSessionId;
		if (!id) {
			return;
		}

		const session = this.sessions.get(id);
		if (session) {
			session.messages = [];
			session.metadata.updatedAt = new Date();
			console.log(`  ✅ 세션 초기화: ${id}`);
		}
	}

	// 세션 삭제
	deleteSession(sessionId: string): boolean {
		const deleted = this.sessions.delete(sessionId);
		if (deleted && this.currentSessionId === sessionId) {
			this.currentSessionId = null;
		}
		return deleted;
	}

	// 모든 세션 ID 반환
	getAllSessionIds(): string[] {
		return Array.from(this.sessions.keys());
	}

	// 세션 개수
	getSessionCount(): number {
		return this.sessions.size;
	}

	// 세션 존재 여부
	hasSession(sessionId: string): boolean {
		return this.sessions.has(sessionId);
	}

	// 세션 메타데이터 업데이트
	updateMetadata(metadata: Partial<SessionMetadata>, sessionId?: string): void {
		const session = this.getSession(sessionId);
		if (session) {
			session.metadata = {
				...session.metadata,
				...metadata,
				updatedAt: new Date(),
			};
		}
	}

	// 세션 내보내기 (JSON)
	exportSession(sessionId?: string): string | null {
		const session = this.getSession(sessionId);
		if (!session) {
			return null;
		}

		return JSON.stringify(
			{
				id: session.id,
				messageCount: session.messages.length,
				metadata: session.metadata,
				messages: session.messages.map((msg) => ({
					type: msg._getType(),
					content: msg.content,
					// 추가 필드는 필요 시 확장
				})),
			},
			null,
			2,
		);
	}

	// ========== 파일 저장/로드 ==========

	// 세션 디렉토리 경로 반환
	private getSessionFilePath(sessionId: string): string {
		return path.join(this.sessionsDir, `${sessionId}.json`);
	}

	// 세션 디렉토리 생성
	private async ensureSessionsDir(): Promise<void> {
		try {
			await fs.mkdir(this.sessionsDir, { recursive: true });
		} catch (error) {
			console.error(`❌ 세션 디렉토리 생성 실패: ${error}`);
		}
	}

	// 세션을 파일로 저장
	async saveSession(sessionId?: string): Promise<boolean> {
		const id = sessionId || this.currentSessionId;
		if (!id) {
			console.log("  ❌ 저장할 세션이 없습니다");
			return false;
		}

		const session = this.sessions.get(id);
		if (!session) {
			console.log(`  ❌ 세션을 찾을 수 없습니다: ${id}`);
			return false;
		}

		try {
			await this.ensureSessionsDir();

			const sessionData = {
				id: session.id,
				metadata: {
					...session.metadata,
					createdAt: session.metadata.createdAt.toISOString(),
					updatedAt: session.metadata.updatedAt.toISOString(),
				},
				messages: session.messages.map((msg) => ({
					type: msg._getType(),
					content: msg.content,
				})),
			};

			const filePath = this.getSessionFilePath(id);
			await fs.writeFile(
				filePath,
				JSON.stringify(sessionData, null, 2),
				"utf-8",
			);

			console.log(`  ✅ 세션 저장 완료: ${filePath}`);
			return true;
		} catch (error) {
			console.error(`  ❌ 세션 저장 실패: ${error}`);
			return false;
		}
	}

	// 파일에서 세션 로드
	async loadSession(sessionId: string): Promise<boolean> {
		try {
			const filePath = this.getSessionFilePath(sessionId);
			const fileContent = await fs.readFile(filePath, "utf-8");
			const sessionData = JSON.parse(fileContent);

			// 메시지 복원
			const messages: BaseMessage[] = sessionData.messages.map(
				// biome-ignore lint/suspicious/noExplicitAny: Session data from JSON
				(msg: any) => {
					const content = msg.content || "";

					switch (msg.type) {
						case "human":
							return new HumanMessage(content);
						case "ai":
							return new AIMessage(content);
						case "system":
							return new SystemMessage(content);
						case "tool":
							return new ToolMessage({ content, tool_call_id: "" });
						default:
							return new HumanMessage(content);
					}
				},
			);

			// 세션 복원
			const session: Session = {
				id: sessionData.id,
				messages,
				metadata: {
					createdAt: new Date(sessionData.metadata.createdAt),
					updatedAt: new Date(sessionData.metadata.updatedAt),
					userId: sessionData.metadata.userId,
					context: sessionData.metadata.context,
				},
			};

			this.sessions.set(sessionData.id, session);
			this.currentSessionId = sessionData.id;

			console.log(
				`  ✅ 세션 로드 완료: ${sessionId} (${messages.length}개 메시지)`,
			);
			return true;
		} catch (error) {
			console.error(`  ❌ 세션 로드 실패: ${error}`);
			return false;
		}
	}

	// 저장된 모든 세션 파일 목록
	async listSavedSessions(): Promise<string[]> {
		try {
			await this.ensureSessionsDir();
			const files = await fs.readdir(this.sessionsDir);
			return files
				.filter((f) => f.endsWith(".json"))
				.map((f) => path.basename(f, ".json"));
		} catch (error) {
			console.error(`  ❌ 세션 목록 조회 실패: ${error}`);
			return [];
		}
	}

	// 세션 파일 삭제
	async deleteSessionFile(sessionId: string): Promise<boolean> {
		try {
			const filePath = this.getSessionFilePath(sessionId);
			await fs.unlink(filePath);
			console.log(`  ✅ 세션 파일 삭제: ${sessionId}`);
			return true;
		} catch (error) {
			console.error(`  ❌ 세션 파일 삭제 실패: ${error}`);
			return false;
		}
	}

	// 모든 세션을 파일로 저장
	async saveAllSessions(): Promise<number> {
		let saved = 0;
		for (const sessionId of this.sessions.keys()) {
			const success = await this.saveSession(sessionId);
			if (success) {
				saved++;
			}
		}
		console.log(`  ✅ ${saved}/${this.sessions.size}개 세션 저장 완료`);
		return saved;
	}
}
