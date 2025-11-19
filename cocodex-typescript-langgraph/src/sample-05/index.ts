/**
 * Sample 05: AI-based Context Compacting
 *
 * AI를 활용한 지능형 컨텍스트 압축 기능
 *
 * 핵심 개념:
 * 1. Token 사용량 계산: tiktoken을 사용하여 정확한 토큰 수 계산
 * 2. 임계값 기반 압축: context window의 n% 이상 사용 시 자동 압축
 * 3. AI 기반 요약: 중간 메시지들을 지능적으로 요약
 * 4. 메시지 보존 전략: 시스템 메시지와 최근 N개 메시지는 보존
 * 5. 특수 명령어: 람다 함수 등록으로 /compact, /status 지원
 *
 * 실행: npm run sample-05
 */

import readline from "node:readline/promises";
import { type AIMessage, HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
// ✅ Sample-02에서 기본 컴포넌트 import
import {
	createCallAgent,
	createExecuteTools,
	GraphState,
} from "../sample-02/index.js";
import { SessionManager } from "../sample-02/session.js";
import { CommandRegistry } from "../sample-03/commands.js";
import { ContextManager } from "../sample-04/context.js";
import { ContextCompactor } from "../sample-05/compactor.js";

dotenv.config();

// ========== Managers ==========

const toolManager = new ToolManager();
const contextManager = new ContextManager();
const sessionManager = new SessionManager(".cocodex/sessions");
const commandRegistry = new CommandRegistry();
const compactor = new ContextCompactor({
	contextWindowSize: 128000,
	threshold: 0.7,
	preserveRecentCount: 4,
});

// ========== 특수 명령어 등록 ==========

// ✅ compactor의 유틸 함수를 사용하여 간결하게 등록
commandRegistry.register(
	"compact",
	compactor.handlerCompact(sessionManager),
	"세션 메시지 압축",
);

commandRegistry.register(
	"status",
	compactor.handlerStatus(sessionManager),
	"세션 상태 조회",
);

// ========== Sample-02의 기본 컴포넌트 재사용 ==========

// Sample-02에서 정의한 팩토리 함수로 기본 노드 생성
const callAgent = createCallAgent(sessionManager, toolManager);
const executeTools = createExecuteTools(sessionManager, toolManager);

// ========== 압축 관련 노드 (재사용 가능) ==========

/**
 * createCompactNode: Compact 노드 팩토리 함수
 *
 * 실제 압축을 수행하는 노드를 생성합니다.
 * Sample-06 이상에서 재사용 가능합니다.
 *
 * @param sessionManager - 세션 관리자
 * @param compactor - 컨텍스트 압축기
 */
export function createCompactNode(
	sessionManager: SessionManager,
	compactor: ContextCompactor,
) {
	return async (state: typeof GraphState.State) => {
		console.log(`\n🗜️  [Compact 노드] 세션 압축 시작`);

		const messages = sessionManager.getMessages(state.sessionId);
		const result = await compactor.compactMessages(messages);

		if (result.compacted) {
			sessionManager.replaceMessages(result.messages, state.sessionId);
			console.log(`  ✅ 세션 메시지 압축 완료`);
			console.log(
				`     메시지: ${result.originalCount}개 → ${result.compactedCount}개`,
			);
			console.log(
				`     토큰: ${result.originalTokens} → ${result.compactedTokens}`,
			);
			console.log(
				`     감소율: ${((1 - result.compactedTokens / result.originalTokens) * 100).toFixed(1)}%`,
			);
		}

		return {};
	};
}

// Sample-05에서 사용하는 노드 인스턴스
const compactNode = createCompactNode(sessionManager, compactor);

// ========== 라우팅 로직 (Sample-05 전용) ==========

/**
 * createShouldContinueWithCompact: compacting을 지원하는 3-way 라우터
 *
 * Sample-02의 shouldContinue와 다른 점:
 * - Tool 호출이 없으면 압축 필요 여부를 체크하여 compact 또는 END로 라우팅
 *
 * Sample-06 이상에서 재사용 가능합니다.
 *
 * @param sessionManager - 세션 관리자
 * @param compactor - 컨텍스트 압축기
 * @param maxIterations - 최대 반복 횟수
 */
export function createShouldContinueWithCompact(
	sessionManager: SessionManager,
	compactor: ContextCompactor,
	maxIterations: number = 10,
) {
	return (state: typeof GraphState.State): string => {
		// 1. 최대 반복 체크
		if (state.iterations >= maxIterations) {
			console.log(`\n⚠️  [Router] 최대 반복 도달 (${maxIterations}회)`);
			return END;
		}

		const messages = sessionManager.getMessages(state.sessionId);
		const lastMessage = messages[messages.length - 1] as AIMessage;

		// 2. Tool 호출이 있으면 tools로
		if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
			console.log(`  🔀 [Router] → tools 노드`);
			return "tools";
		}

		// 3. Tool 호출 없음 → 압축 필요 여부 체크
		if (compactor.shouldCompact(messages)) {
			console.log(`  🔀 [Router] 압축 필요 → compact 노드`);
			return "compact";
		}

		// 4. 압축 불필요 → 종료
		console.log(`  🔀 [Router] → END`);
		return END;
	};
}

// Sample-05에서 사용하는 라우터 인스턴스
const shouldContinue = createShouldContinueWithCompact(
	sessionManager,
	compactor,
);

/**
 * createAgent: Sample-05 에이전트 생성
 *
 * 그래프 구조:
 *   [START] → [agent] ⇄ [tools]
 *                ↓
 *         shouldContinue (3-way)
 *          ↙     ↓     ↘
 *     [tools] [compact] [END]
 *                ↓
 *              [END]
 */
function createAgent() {
	const workflow = new StateGraph(GraphState)
		.addNode("agent", callAgent)
		.addNode("tools", executeTools)
		.addNode("compact", compactNode)
		.addEdge(START, "agent")
		.addConditionalEdges("agent", shouldContinue, {
			tools: "tools",
			compact: "compact",
			[END]: END,
		})
		.addEdge("tools", "agent")
		.addEdge("compact", END);

	return workflow.compile();
}

// ========== 유틸리티 함수 ==========

function printContextUsage(sessionId: string) {
	const messages = sessionManager.getMessages(sessionId);
	const tokens = compactor.estimateTokens(messages);
	const options = compactor.getOptions();
	const ratio = tokens / options.contextWindowSize;

	console.log(`\n📊 Context Window 사용률:`);
	console.log(`   토큰: ${tokens} / ${options.contextWindowSize}`);
	console.log(`   비율: ${(ratio * 100).toFixed(1)}%`);

	const threshold = options.threshold * 100;

	if (ratio >= options.threshold) {
		console.log(`   ⚠️  임계값(${threshold}%) 초과! 압축이 필요합니다.`);
	} else {
		console.log(`   ✅ 정상 (임계값: ${threshold}%)`);
	}
}

async function simulateConversation(sessionId: string, app: any) {
	const questions = [
		"이 프로젝트의 목표를 설명해주세요.",
		"LangGraph가 무엇인가요?",
		"Tool 시스템은 어떻게 작동하나요?",
		"세션 관리 기능에 대해 설명해주세요.",
		"컨텍스트 파일은 어떻게 로드되나요?",
		"이전에 설명한 내용을 간단히 정리해주세요.",
	];

	for (let i = 0; i < questions.length; i++) {
		const question = questions[i];

		console.log(`\n${"=".repeat(60)}`);
		console.log(`🔄 턴 ${i + 1}/${questions.length}`);
		console.log(`${"=".repeat(60)}`);
		console.log(`\n💬 질문: ${question}`);

		sessionManager.addMessage(new HumanMessage(question), sessionId);

		printContextUsage(sessionId);

		console.log(`\n🤖 AI 처리 중...\n`);
		await app.invoke({ sessionId, iterations: 0 });

		const messages = sessionManager.getMessages(sessionId);
		const lastMessage = messages[messages.length - 1];
		console.log(`\n✅ AI 응답:\n${lastMessage.content}\n`);

		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

// ========== 메인 ==========

async function main() {
	console.log("🎯 Sample 05: AI-based Context Compacting\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - AI를 사용한 지능형 메시지 요약");
	console.log("  - Context window 사용률 기반 자동 압축");
	console.log("  - 시스템 메시지 및 최근 메시지 보존");
	console.log("  - tiktoken을 사용한 정확한 토큰 계산");
	console.log("  - 람다 함수 등록으로 특수 명령어 지원");
	console.log("  - LangGraph 노드로 압축 로직 구현 (선언적 워크플로우)\n");
	console.log("=".repeat(60));
	console.log("\n그래프 구조:");
	console.log("  [START] → [agent] ⇄ [tools]");
	console.log("               ↓");
	console.log("        shouldContinue (3-way)");
	console.log("          ↙     ↓     ↘");
	console.log("     [tools] [compact] [END]");
	console.log("                ↓");
	console.log("              [END]");
	console.log("=".repeat(60));

	// 1. 컨텍스트 및 명령어 로드
	const initialContext = await contextManager.buildInitialUserMessage();
	await commandRegistry.loadCommands();

	console.log(`\n✅ 컨텍스트 로드 완료! (${initialContext.length}자)`);
	console.log(`\n${commandRegistry.getCommandDescriptions()}`);
	console.log("=".repeat(60));

	// 2. Compaction 설정 출력
	const options = compactor.getOptions();
	console.log(`\n⚙️  Compaction 설정:`);
	console.log(`   모델: ${process.env.OPENAI_MODEL || "gpt-5"}`);
	console.log(`   Context Window: ${options.contextWindowSize} 토큰`);
	console.log(`   압축 임계값: ${(options.threshold * 100).toFixed(0)}%`);
	console.log(`   보존할 최근 메시지: ${options.preserveRecentCount}개`);
	console.log("=".repeat(60));

	// 3. 사용자 입력 받기
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const userInput = await rl.question(
		"\n💬 질문 또는 명령어를 입력하세요 (Enter = 시뮬레이션): ",
	);
	rl.close();

	const input = userInput.trim();

	// 4. 세션 생성
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();
	sessionManager.addMessage(new HumanMessage(initialContext), sessionId);

	// 5. Agent 생성
	const app = createAgent();

	// 6. 입력 처리
	if (input === "") {
		// 기본값: 시뮬레이션 실행
		console.log("\n🎬 시뮬레이션 모드 시작");
		console.log(
			"   여러 개의 질문을 자동으로 처리하여 압축 기능을 테스트합니다.\n",
		);
		await simulateConversation(sessionId, app);

		// 최종 통계
		console.log(`\n${"=".repeat(60)}`);
		console.log("📊 최종 통계");
		console.log(`${"=".repeat(60)}`);
		printContextUsage(sessionId);
		console.log(`   총 메시지: ${sessionManager.getMessageCount(sessionId)}개`);
	} else {
		// 사용자 입력 처리
		let finalPrompt: string | null = input;

		if (commandRegistry.isCommand(input)) {
			const parsed = commandRegistry.parseCommand(input);

			if (parsed) {
				const { commandName, args } = parsed;

				// 명령어 실행
				const result = await commandRegistry.execute(commandName, args, {
					sessionManager,
					compactor,
					sessionId,
				});

				// 에러 처리
				if (result.type === "error") {
					console.log(`\n${result.message}`);
					console.log(commandRegistry.getCommandDescriptions());
					return;
				}

				// prompt 타입만 처리 (Sample-04에서는 template 명령어만 사용)
				if (result.type !== "prompt") {
					console.log("\n❌ 예상치 못한 명령어 결과 타입");
					return;
				}

				finalPrompt = result.message;

				// 에러 처리
				if (finalPrompt?.startsWith("❌")) {
					console.log(`\n${finalPrompt}`);
					console.log(commandRegistry.getCommandDescriptions());
					return;
				}

				// null = 특수 명령어 (AI에게 전달 안 함)
				if (finalPrompt === null) {
					console.log("\n✅ 명령어 실행 완료");
					printContextUsage(sessionId);
					return;
				}

				// 템플릿 명령어 (AI에게 전달)
				console.log(`\n🎯 명령어: /${commandName}`);
				console.log(`📝 인자: ${args}`);
				console.log(`\n💬 생성된 프롬프트:\n${finalPrompt}\n`);
				console.log("=".repeat(60));
			}
		} else {
			console.log(`\n💬 일반 질문: ${finalPrompt}\n`);
			console.log("=".repeat(60));
		}

		// AI 처리
		if (finalPrompt !== null) {
			sessionManager.addMessage(new HumanMessage(finalPrompt), sessionId);

			printContextUsage(sessionId);

			console.log("\n🤖 AI 처리 중...\n");
			await app.invoke({ sessionId, iterations: 0 });

			const messages = sessionManager.getMessages(sessionId);
			const lastMessage = messages[messages.length - 1];
			console.log(`\n✅ AI 응답:\n${lastMessage.content}\n`);
			console.log("=".repeat(60));
		}
	}

	// 7. 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession(sessionId);

	console.log("\n💡 Sample 05 핵심 학습 내용:");
	console.log("  1. AI 기반 메시지 요약으로 context 압축");
	console.log("  2. tiktoken을 사용한 정확한 토큰 계산");
	console.log("  3. 임계값 기반 자동 압축 트리거");
	console.log("  4. 시스템 메시지와 최근 메시지 보존 전략");
	console.log("  5. 람다 함수 등록으로 특수 명령어 지원\n");

	console.log("🚀 다음: npm run sample-06 (추가 기능)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
