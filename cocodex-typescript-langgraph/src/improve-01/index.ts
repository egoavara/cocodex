/**
 * Improve 01: Stream Output
 *
 * Improve-00 기반에 실시간 스트리밍 출력 추가
 *
 * 핵심 개념:
 * 1. Token Streaming: AI 응답을 토큰 단위로 실시간 출력
 * 2. User Experience: 답답함 없이 한 단어씩 주르륵 타이핑
 * 3. model.stream(): ChatOpenAI의 스트리밍 API 활용
 * 4. Chunk Aggregation: 스트림 조각들을 모아서 완전한 메시지 생성
 *
 * 실행: npm run improve-01
 */

import readline from "node:readline/promises";
import { type AIMessage, HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
import { createExecuteTools } from "../sample-02/index.js";
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
import {
	imageToolExecutor,
	imageToolSchema,
} from "../improve-00/image-tool.js";

// 🎯 Improve-01: 스트리밍 출력을 위한 ChatOpenAI import
import { ChatOpenAI } from "@langchain/openai";
import { AIMessageChunk } from "@langchain/core/messages";

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

// ========== 🎯 Improve-01: 스트리밍 Agent 노드 ==========

/**
 * createCallAgentWithStreaming: 스트리밍 출력을 지원하는 Agent 노드
 *
 * 주요 변경사항:
 * 1. model.invoke() → model.stream()
 * 2. 토큰 단위로 실시간 출력
 * 3. 전체 응답을 조합하여 세션에 저장
 */
export function createCallAgentWithStreaming(
	sessionManager: SessionManager,
	toolManager: ToolManager,
) {
	return async (state: typeof GraphStateWithDialog.State) => {
		const currentIteration = state.iterations + 1;
		console.log(`\n📍 [Agent 노드] 반복 ${currentIteration}`);

		const model = new ChatOpenAI({
			modelName: process.env.OPENAI_MODEL || "gpt-5",
			temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "1"),
			streaming: true, // 🎯 스트리밍 활성화
		}).bindTools(toolManager.getToolSchemas());

		// SessionManager에서 메시지 가져오기
		const messages = sessionManager.getMessages(state.sessionId);

		// 🎯 스트리밍 시작
		const stream = await model.stream(messages);

		// 응답 조각들을 모을 배열
		let aggregatedResponse: AIMessageChunk | null = null;
		let isFirstChunk = true;

		// 🎯 스트림에서 토큰 단위로 수신
		for await (const chunk of stream) {
			// 첫 번째 청크일 때 줄바꿈
			if (isFirstChunk) {
				console.log("\n🤖 AI (streaming): ");
				isFirstChunk = false;
			}

			// 토큰 단위로 실시간 출력 (줄바꿈 없이)
			if (chunk.content) {
				process.stdout.write(chunk.content as string);
			}

			// 응답 조각들을 합치기
			if (!aggregatedResponse) {
				aggregatedResponse = chunk;
			} else {
				aggregatedResponse = aggregatedResponse.concat(chunk);
			}
		}

		// 스트리밍 완료 후 줄바꿈
		if (!isFirstChunk) {
			console.log("\n");
		}

		// aggregatedResponse가 없으면 기본 메시지 생성
		if (!aggregatedResponse) {
			console.log("  ⚠️  [AI] 응답이 없습니다.");
			return {
				iterations: currentIteration,
			};
		}

		// tool_calls가 있으면 로그
		if (
			aggregatedResponse.tool_calls &&
			aggregatedResponse.tool_calls.length > 0
		) {
			console.log(
				`  💭 [AI 판단] ${aggregatedResponse.tool_calls.length}개 Tool 호출 필요`,
			);
		} else {
			console.log(`  ✅ [AI 판단] 최종 응답 생성`);
		}

		// SessionManager에 AI 응답 추가
		sessionManager.addMessage(aggregatedResponse, state.sessionId);

		return {
			iterations: currentIteration,
		};
	};
}

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

// 🎯 Improve-01: 스트리밍 버전의 callAgent 사용
const callAgent = createCallAgentWithStreaming(sessionManager, toolManager);
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

/**
 * 🎯 Improve-01: 스트리밍 환경에 맞춘 shouldContinue
 *
 * getUserInput 노드에서 AI 응답 출력을 이미 했으므로,
 * 여기서는 출력하지 않고 라우팅만 수행
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

const shouldContinue = createShouldContinue(sessionManager, compactor);

/**
 * createAgent: Improve-01 에이전트 생성
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
 *     routeCommand     [agent] (🎯 스트리밍 출력)
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
		.addNode("agent", callAgent) // 🎯 스트리밍 버전
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
	console.log("🎯 Improve 01: Stream Output\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - Improve-00 기반 (이미지 읽기 + 멀티턴 대화)");
	console.log("  - 🎯 Token Streaming: AI 응답을 실시간 출력");
	console.log("  - 🎯 ChatGPT처럼 한 단어씩 주르륵 타이핑");
	console.log("  - model.stream() API 활용");
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
	console.log("  - 🎯 AI 응답이 실시간으로 스트리밍됩니다!");
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

	console.log("\n💡 Improve 01 핵심 학습 내용:");
	console.log("  1. Token Streaming: model.stream()으로 실시간 출력");
	console.log(
		"  2. Chunk Aggregation: 스트림 조각들을 모아서 완전한 메시지 생성",
	);
	console.log("  3. User Experience: 답답함 없이 ChatGPT처럼 타이핑");
	console.log("  4. process.stdout.write(): 줄바꿈 없이 연속 출력");
	console.log(
		"  5. AIMessageChunk.concat(): 청크 병합으로 완전한 메시지 생성\n",
	);

	console.log("🚀 다음: npm run improve-02 (MCP 연동)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
