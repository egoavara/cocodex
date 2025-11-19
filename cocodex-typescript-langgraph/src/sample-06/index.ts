/**
 * Sample 06: Multi-turn Interactive Chat
 *
 * 멀티턴 대화형 인터페이스 구현 (완전히 재설계된 버전)
 *
 * 핵심 개념:
 * 1. Multi-turn Dialog: AI와 사용자가 채팅처럼 계속 주고받기
 * 2. Command-first Architecture: 명령어 처리가 그래프의 일급 시민
 * 3. getUserInput → parseInput → handleCommand|agent 흐름
 * 4. CommandResult 타입으로 모든 명령어 결과 통일
 * 5. /close 명령어로 명시적 종료
 *
 * 실행: npm run sample-06
 */

import readline from "node:readline/promises";
import { type AIMessage, HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
import { createCallAgent, createExecuteTools } from "../sample-02/index.js";
import { SessionManager } from "../sample-02/session.js";
import {
	CommandRegistry,
	type CommandResult,
	createHandleCommandNode,
	createParseInputNode,
} from "../sample-03/commands.js";
import { ContextManager } from "../sample-04/context.js";
import { ContextCompactor } from "../sample-05/compactor.js";
import { createCompactNode } from "../sample-05/index.js";

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

// ========== GraphState 확장 (대화 제어) ==========

import { Annotation } from "@langchain/langgraph";

export const GraphStateWithDialog = Annotation.Root({
	sessionId: Annotation<string>({
		reducer: (_, next) => next,
		default: () => "",
	}),
	iterations: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 0,
	}),
	userInput: Annotation<string | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),
	// biome-ignore lint/suspicious/noExplicitAny: CommandResult is defined in commands.ts
	commandResult: Annotation<any>({
		reducer: (_, next) => next,
		default: () => null,
	}),
	shouldClose: Annotation<boolean>({
		reducer: (_, next) => next,
		default: () => false,
	}),
});

// ========== 특수 명령어 등록 ==========

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

commandRegistry.register(
	"close",
	async (_args, _context) => {
		console.log("\n👋 대화를 종료합니다.");
		return { type: "close" };
	},
	"대화 종료",
);

// ========== Sample-02의 기본 컴포넌트 재사용 ==========

const callAgent = createCallAgent(sessionManager, toolManager);
const executeTools = createExecuteTools(sessionManager, toolManager);
const compactNode = createCompactNode(sessionManager, compactor);

// ========== 명령어 처리 노드 재사용 ==========

const parseInputNode = createParseInputNode(commandRegistry);
const handleCommandNode = createHandleCommandNode(commandRegistry);

// ========== 대화 관련 노드 ==========

/**
 * getUserInput: 사용자 입력을 받는 노드
 */
export function createGetUserInputNode(
	rl: readline.Interface,
	sessionManager: SessionManager,
) {
	return async (state: typeof GraphStateWithDialog.State) => {
		// AI 응답이 있으면 출력
		const messages = sessionManager.getMessages(state.sessionId);
		if (messages.length > 1) {
			const lastMessage = messages[messages.length - 1] as AIMessage;
			if (lastMessage._getType() === "ai") {
				console.log(`\n${"=".repeat(60)}`);
				console.log(`\n🤖 AI:\n${lastMessage.content}\n`);
				console.log("=".repeat(60));
			}
		}

		// 사용자 입력 받기
		let userInput: string;
		try {
			userInput = await rl.question("\n💬 You: ");
		} catch (_error) {
			// readline이 닫혔거나 stdin EOF 도달
			console.log("\n👋 입력 스트림이 닫혔습니다. 대화를 종료합니다.");
			return { shouldClose: true };
		}

		const input = userInput.trim();

		// 빈 입력 = 종료
		if (input === "") {
			console.log("\n👋 빈 입력으로 대화를 종료합니다.");
			return { shouldClose: true };
		}

		return {
			userInput: input,
			iterations: 0, // 새로운 턴이므로 iterations 리셋
		};
	};
}

// ========== 라우팅 로직 ==========

/**
 * routeInput: userInput에 따라 라우팅
 *
 * 흐름:
 * - commandResult가 null → 일반 메시지 → agent
 * - commandResult가 있음 → 명령어 → handleCommand
 */
export function createRouteInput() {
	return (state: typeof GraphStateWithDialog.State): string => {
		// parseInput 노드가 commandResult를 설정함
		if (state.commandResult === null) {
			console.log("  🔀 [RouteInput] → agent 노드");
			return "agent";
		}

		console.log("  🔀 [RouteInput] → handleCommand 노드");
		return "handleCommand";
	};
}

/**
 * routeCommand: 명령어 실행 결과에 따라 라우팅
 *
 * 흐름:
 * - close → END
 * - error → getUserInput (에러 출력 후 다시 입력)
 * - executed → getUserInput (실행 완료, 다시 입력)
 * - prompt → agent (AI에게 전달)
 */
export function createRouteCommand(commandRegistry: CommandRegistry) {
	return (state: typeof GraphStateWithDialog.State): string => {
		const result: CommandResult = state.commandResult;

		if (result.type === "close") {
			console.log("  🔀 [RouteCommand] close → END");
			return END;
		}

		if (result.type === "error") {
			console.log(`  🔀 [RouteCommand] error → getUserInput`);
			console.log(`\n${result.message}`);
			console.log(commandRegistry.getCommandDescriptions());
			return "getUserInput";
		}

		if (result.type === "executed") {
			console.log("  🔀 [RouteCommand] executed → getUserInput");
			return "getUserInput";
		}

		if (result.type === "prompt") {
			console.log("  🔀 [RouteCommand] prompt → addMessage");
			return "addMessage";
		}

		console.log("  🔀 [RouteCommand] unknown → getUserInput");
		return "getUserInput";
	};
}

/**
 * addMessage: commandResult.message를 세션에 추가하는 노드
 */
export function createAddMessageNode(sessionManager: SessionManager) {
	return async (state: typeof GraphStateWithDialog.State) => {
		const result: CommandResult = state.commandResult;

		if (result.type === "prompt") {
			console.log(`\n💬 생성된 프롬프트:\n${result.message}\n`);
			sessionManager.addMessage(
				new HumanMessage(result.message),
				state.sessionId,
			);
		}

		return {};
	};
}

/**
 * addUserMessage: userInput을 세션에 추가하는 노드 (일반 메시지)
 */
export function createAddUserMessageNode(sessionManager: SessionManager) {
	return async (state: typeof GraphStateWithDialog.State) => {
		if (state.userInput) {
			sessionManager.addMessage(
				new HumanMessage(state.userInput),
				state.sessionId,
			);
		}
		return {};
	};
}

/**
 * shouldContinue: agent 후 라우팅
 *
 * 흐름:
 * - shouldClose → END
 * - iterations 초과 → END
 * - tool 호출 → tools
 * - 압축 필요 → compact
 * - 일반 응답 → getUserInput
 */
export function createShouldContinue(
	sessionManager: SessionManager,
	compactor: ContextCompactor,
	maxIterations: number = 10,
) {
	return (state: typeof GraphStateWithDialog.State): string => {
		// 1. 종료 플래그
		if (state.shouldClose) {
			console.log("\n🔀 [ShouldContinue] shouldClose = true → END");
			return END;
		}

		// 2. 최대 반복
		if (state.iterations >= maxIterations) {
			console.log(`\n⚠️  [ShouldContinue] 최대 반복 도달 (${maxIterations}회)`);
			return END;
		}

		const messages = sessionManager.getMessages(state.sessionId);
		const lastMessage = messages[messages.length - 1] as AIMessage;

		// 3. Tool 호출
		if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
			console.log(`  🔀 [ShouldContinue] → tools 노드`);
			return "tools";
		}

		// 4. 압축 필요
		if (compactor.shouldCompact(messages)) {
			console.log(`  🔀 [ShouldContinue] 압축 필요 → compact 노드`);
			return "compact";
		}

		// 5. 일반 응답 → 사용자 입력 대기
		console.log(`  🔀 [ShouldContinue] → getUserInput 노드`);
		return "getUserInput";
	};
}

/**
 * createAgent: Sample-06 에이전트 생성
 *
 * 그래프 구조:
 *   [START] → [getUserInput]
 *                ↓
 *           [parseInput]
 *                ↓
 *           routeInput (2-way)
 *            ↙        ↘
 *     [handleCommand] [addUserMessage]
 *          ↓              ↓
 *     routeCommand     [agent]
 *       ↙  ↓  ↘           ↓
 *  [END][getUserInput][addMessage] shouldContinue (4-way)
 *           ↑          ↓        ↙    ↓    ↓    ↓
 *           └────────[agent] [tools][compact][getUserInput][END]
 */
function createAgent(rl: readline.Interface) {
	const getUserInputNode = createGetUserInputNode(rl, sessionManager);
	const addMessageNode = createAddMessageNode(sessionManager);
	const addUserMessageNode = createAddUserMessageNode(sessionManager);
	const routeInput = createRouteInput();
	const routeCommand = createRouteCommand(commandRegistry);
	const shouldContinue = createShouldContinue(sessionManager, compactor);

	const workflow = new StateGraph(GraphStateWithDialog)
		.addNode("getUserInput", getUserInputNode)
		.addNode("parseInput", parseInputNode)
		.addNode("handleCommand", handleCommandNode)
		.addNode("addMessage", addMessageNode)
		.addNode("addUserMessage", addUserMessageNode)
		.addNode("agent", callAgent)
		.addNode("tools", executeTools)
		.addNode("compact", compactNode)
		.addEdge(START, "getUserInput")
		.addEdge("getUserInput", "parseInput")
		.addConditionalEdges("parseInput", routeInput, {
			handleCommand: "handleCommand",
			agent: "addUserMessage",
		})
		.addEdge("addUserMessage", "agent")
		.addConditionalEdges("handleCommand", routeCommand, {
			[END]: END,
			getUserInput: "getUserInput",
			addMessage: "addMessage",
		})
		.addEdge("addMessage", "agent")
		.addConditionalEdges("agent", shouldContinue, {
			tools: "tools",
			compact: "compact",
			getUserInput: "getUserInput",
			[END]: END,
		})
		.addEdge("tools", "agent")
		.addEdge("compact", END);

	return workflow.compile();
}

// ========== 메인 ==========

async function main() {
	console.log("🎯 Sample 06: Multi-turn Interactive Chat (Redesigned)\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log(
		"  - Command-first Architecture: 명령어 처리가 그래프의 일급 시민",
	);
	console.log("  - getUserInput → parseInput → handleCommand|agent 흐름");
	console.log("  - CommandResult 타입으로 모든 결과 통일");
	console.log("  - /close 명령어 또는 빈 입력으로 종료");
	console.log("  - 자동 컨텍스트 압축 지원\n");
	console.log("=".repeat(60));
	console.log("\n그래프 구조:");
	console.log("  [START] → [getUserInput] → [parseInput]");
	console.log("               ↓                  ↓");
	console.log("          (대화 계속)      routeInput (2-way)");
	console.log("                            ↙        ↘");
	console.log("                     [handleCommand] [agent]");
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

	// 3. Readline 인터페이스 생성
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	// 4. 세션 생성
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();
	sessionManager.addMessage(new HumanMessage(initialContext), sessionId);

	// 5. Agent 생성
	const app = createAgent(rl);

	// 6. 팁 출력
	console.log("\n💡 팁:");
	console.log("  - 빈 입력 또는 /close 명령어로 대화 종료");
	console.log("  - /compact: 세션 압축");
	console.log("  - /status: 세션 상태 조회");
	console.log("=".repeat(60));
	console.log("\n🤖 대화를 시작합니다...\n");

	// 7. 대화 루프 시작
	await app.invoke({
		sessionId,
		iterations: 0,
		userInput: null,
		commandResult: null,
		shouldClose: false,
	});

	// 8. 종료 처리
	rl.close();

	console.log("\n" + "=".repeat(60));
	console.log("📊 최종 통계");
	console.log("=".repeat(60));
	console.log(`   총 메시지: ${sessionManager.getMessageCount(sessionId)}개`);

	// 9. 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession(sessionId);

	console.log("\n💡 Sample 06 핵심 학습 내용:");
	console.log("  1. Command-first Architecture: 명령어가 그래프의 일급 시민");
	console.log("  2. parseInput/handleCommand 노드로 명령어 처리 분리");
	console.log("  3. CommandResult 타입으로 흐름 제어");
	console.log("  4. 조건부 라우팅으로 복잡한 흐름 구현");
	console.log("  5. 모든 샘플에서 재사용 가능한 구조\n");

	console.log("🚀 다음: npm run sample-07 (추가 기능)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
