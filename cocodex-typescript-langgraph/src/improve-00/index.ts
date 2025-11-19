/**
 * Improve 00: Image Reading Tool
 *
 * Sample-06 기반에 이미지 읽기 기능 추가
 *
 * 핵심 개념:
 * 1. Multi-turn Dialog: AI와 사용자가 채팅처럼 계속 주고받기 (Sample-06 동일)
 * 2. Image Tool: AI가 스스로 판단하여 read_image Tool 호출
 * 3. Vision API: base64 인코딩된 이미지를 AI가 자동으로 분석
 * 4. 동적 Tool 등록: ToolManager.registerTool()로 런타임에 추가
 *
 * 실행: npm run improve-00
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

// 🎯 Improve-00: 이미지 Tool import
import { imageToolExecutor, imageToolSchema } from "./image-tool.js";

dotenv.config();

// ========== Managers ==========

const toolManager = new ToolManager();

// 🎯 Improve-00: read_image Tool 동적 등록
toolManager.registerTool(imageToolSchema, imageToolExecutor);

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
import {
	createAddMessageNode,
	createAddUserMessageNode,
	createGetUserInputNode,
	createRouteCommand,
	createRouteInput,
	createShouldContinue,
} from "../sample-06/index.js";

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
const addMessageNode = createAddMessageNode(sessionManager);
const addUserMessageNode = createAddUserMessageNode(sessionManager);
const routeInput = createRouteInput();
const routeCommand = createRouteCommand(commandRegistry);
const shouldContinue = createShouldContinue(sessionManager, compactor);

/**
 * createAgent: Improve-00 에이전트 생성
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
	console.log("🎯 Improve 00: Image Reading Tool\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - Sample-06 기반 (멀티턴 대화형 인터페이스)");
	console.log("  - read_image Tool 추가 (AI가 스스로 판단하여 호출)");
	console.log("  - Vision API 자동 활용 (base64 인코딩)");
	console.log("  - 동적 Tool 등록 (ToolManager.registerTool())");
	console.log("  - /close 명령어 또는 빈 입력으로 종료\n");
	console.log("=".repeat(60));

	// 1. 컨텍스트 및 명령어 로드
	const initialContext = await contextManager.buildInitialUserMessage();
	await commandRegistry.loadCommands();

	console.log(`\n✅ 컨텍스트 로드 완료! (${initialContext.length}자)`);
	console.log(`\n${commandRegistry.getCommandDescriptions()}`);
	console.log("=".repeat(60));

	// 2. Tool 목록 출력
	console.log("\n🔧 등록된 Tool 목록:");
	const toolNames = toolManager.getToolNames();
	for (const toolName of toolNames) {
		console.log(`  - ${toolName}`);
	}
	console.log("=".repeat(60));

	// 3. Compaction 설정 출력
	const options = compactor.getOptions();
	console.log(`\n⚙️  Compaction 설정:`);
	console.log(`   모델: ${process.env.OPENAI_MODEL || "gpt-5"}`);
	console.log(`   Context Window: ${options.contextWindowSize} 토큰`);
	console.log(`   압축 임계값: ${(options.threshold * 100).toFixed(0)}%`);
	console.log(`   보존할 최근 메시지: ${options.preserveRecentCount}개`);
	console.log("=".repeat(60));

	// 4. Readline 인터페이스 생성
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	// 5. 세션 생성
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();
	sessionManager.addMessage(new HumanMessage(initialContext), sessionId);

	// 6. Agent 생성
	const app = createAgent(rl);

	// 7. 팁 출력
	console.log("\n💡 팁:");
	console.log("  - 빈 입력 또는 /close 명령어로 대화 종료");
	console.log("  - /compact: 세션 압축");
	console.log("  - /status: 세션 상태 조회");
	console.log('  - 이미지 분석: "test.png를 분석해줘" 등으로 요청');
	console.log("=".repeat(60));
	console.log("\n🤖 대화를 시작합니다...\n");

	// 8. 대화 루프 시작
	await app.invoke({
		sessionId,
		iterations: 0,
		userInput: null,
		commandResult: null,
		shouldClose: false,
	});

	// 9. 종료 처리
	rl.close();

	console.log("\n" + "=".repeat(60));
	console.log("📊 최종 통계");
	console.log("=".repeat(60));
	console.log(`   총 메시지: ${sessionManager.getMessageCount(sessionId)}개`);

	// 10. 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession(sessionId);

	console.log("\n💡 Improve 00 핵심 학습 내용:");
	console.log("  1. 동적 Tool 등록: ToolManager.registerTool()로 런타임 추가");
	console.log("  2. AI Tool Selection: AI가 스스로 적절한 Tool 선택");
	console.log("  3. Vision API: base64 이미지를 자동으로 분석");
	console.log("  4. 코드 격리: 기존 Sample 코드를 수정하지 않고 확장");
	console.log("  5. Tool Description: AI의 판단 기준이 되는 설명의 중요성\n");

	console.log("🚀 다음: npm run improve-01 (Stream 출력)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
