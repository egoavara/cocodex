/**
 * Improve 02: MCP Integration
 *
 * Improve-01 기반에 MCP (Model Context Protocol) 통합 추가
 *
 * 핵심 개념:
 * 1. MCP: AI와 외부 시스템을 연결하는 표준 프로토콜
 * 2. MCPManager: MCP 서버 관리 및 Tool 동적 등록
 * 3. stdio transport: 프로세스 간 통신 방식
 * 4. 코드 재사용: improve-01에서 함수들을 import
 *
 * 실행: npm run improve-02
 */

import readline from "node:readline/promises";
import { HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
import { createExecuteTools } from "../sample-02/index.js";
import { SessionManager } from "../sample-02/session.js";
import {
	CommandRegistry,
	createHandleCommandNode,
	createParseInputNode,
} from "../sample-03/commands.js";
import { ContextManager } from "../sample-04/context.js";
import { ContextCompactor } from "../sample-05/compactor.js";
import { createCompactNode } from "../sample-05/index.js";
import {
	createAddMessageNode,
	createAddUserMessageNode,
	createGetUserInputNode,
	createRouteCommand,
	createRouteInput,
} from "../sample-06/index.js";

// 🎯 Improve-00: 이미지 Tool import
import {
	imageToolExecutor,
	imageToolSchema,
} from "../improve-00/image-tool.js";

// 🎯 Improve-01: 스트리밍 출력 관련 함수들 import (중복 방지)
import {
	createCallAgentWithStreaming,
	createShouldContinue,
	GraphStateWithDialog as GraphStateWithDialogImprove01,
} from "../improve-01/index.js";

// 🎯 Improve-02: MCP Manager import
import { MCPManager } from "./mcp-manager.js";

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

// 🎯 Improve-02: MCP Manager 생성
const mcpManager = new MCPManager(toolManager);

// ========== GraphState 재사용 ==========

// 🎯 Improve-01에서 GraphStateWithDialog 재사용 (중복 방지)
export const GraphStateWithDialog = GraphStateWithDialogImprove01;

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

// ========== 노드 생성 (Improve-01 함수 재사용) ==========

// 🎯 Improve-01에서 import한 함수 사용
const callAgent = createCallAgentWithStreaming(sessionManager, toolManager);
const shouldContinue = createShouldContinue(sessionManager, compactor);

// 기존 노드들
const executeTools = createExecuteTools(sessionManager, toolManager);
const compactNode = createCompactNode(sessionManager, compactor);
const parseInputNode = createParseInputNode(commandRegistry);
const handleCommandNode = createHandleCommandNode(commandRegistry);
const addMessageNode = createAddMessageNode(sessionManager);
const addUserMessageNode = createAddUserMessageNode(sessionManager);
const routeInput = createRouteInput();
const routeCommand = createRouteCommand(commandRegistry);

/**
 * createAgent: Improve-02 에이전트 생성
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
 *     routeCommand     [agent] (🎯 스트리밍 출력 + 🎯 MCP Tools)
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
		.addNode("agent", callAgent) // 🎯 스트리밍 버전 (improve-01에서 import)
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
	console.log("🎯 Improve 02: MCP Integration\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - Improve-01 기반 (이미지 읽기 + 스트리밍 출력)");
	console.log("  - 🎯 MCP: Model Context Protocol 통합");
	console.log("  - 🎯 외부 MCP 서버의 Tools 동적 등록");
	console.log("  - 🎯 stdio transport로 프로세스 간 통신");
	console.log("  - 🎯 코드 재사용: improve-01에서 함수 import");
	console.log("  - /close 명령어 또는 빈 입력으로 종료\n");
	console.log("=".repeat(60));

	// 🎯 Improve-02: MCP 서버 초기화
	try {
		await mcpManager.initialize();
	} catch (error) {
		console.error("\n❌ MCP 초기화 실패:", error);
		console.log("   MCP 없이 계속 진행합니다...");
	}

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

	// 🎯 Improve-02: 연결된 MCP 서버 목록 출력
	const mcpServers = mcpManager.getConnectedServers();
	if (mcpServers.length > 0) {
		console.log("\n🔌 연결된 MCP 서버:");
		for (const serverName of mcpServers) {
			console.log(`  - ${serverName}`);
		}
		console.log("=".repeat(60));
	}

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
	console.log("  - 🎯 AI 응답이 실시간으로 스트리밍됩니다!");
	console.log("  - 🎯 MCP Tools를 통해 외부 시스템 접근 가능!");
	console.log("=".repeat(60));
	console.log("\n🤖 대화를 시작합니다...\n");

	// 8. 대화 루프 시작
	try {
		await app.invoke({
			sessionId,
			iterations: 0,
			userInput: null,
			commandResult: null,
			shouldClose: false,
		});
	} finally {
		// 9. 종료 처리
		rl.close();

		// 🎯 Improve-02: MCP Manager cleanup
		await mcpManager.cleanup();
	}

	console.log("\n" + "=".repeat(60));
	console.log("📊 최종 통계");
	console.log("=".repeat(60));
	console.log(`   총 메시지: ${sessionManager.getMessageCount(sessionId)}개`);

	// 10. 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession(sessionId);

	console.log("\n💡 Improve 02 핵심 학습 내용:");
	console.log("  1. MCP Protocol: AI와 외부 시스템을 연결하는 표준");
	console.log("  2. stdio transport: 프로세스 간 표준 입출력 통신");
	console.log("  3. 동적 Tool 등록: 런타임에 외부 도구 통합");
	console.log("  4. MCPManager: MCP 서버 관리를 캡슐화");
	console.log("  5. 코드 재사용: improve-01 함수를 import하여 중복 제거");
	console.log("  6. Tool 이름 충돌 방지: {서버이름}_{tool이름} snake_case\n");

	console.log("🎯 MCP 서버 추가 방법:");
	console.log("  1. src/improve-02/mcp-manager.ts 파일 열기");
	console.log("  2. MCP_SERVERS 객체에 새 서버 추가");
	console.log('  3. 예: filesystem: { command: "npx", args: [...] }');
	console.log("  4. npm run improve-02 실행\n");

	console.log("🚀 다음: npm run improve-03 (추가 기능)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
