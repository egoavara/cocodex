/**
 * Sample 02: 대화 세션 관리자 구현
 *
 * Sample 01의 Agent Loop에 SessionManager를 적용하여 대화 세션 기반으로 채팅합니다.
 *
 * 핵심 포인트:
 * 1. SessionManager 적용: 메시지를 세션에 저장하여 관리
 * 2. 신규 세션 생성: 항상 새로운 세션으로 시작
 * 3. 세션 저장: 대화 완료 후 파일로 저장 (.cocodex/sessions/)
 * 4. 메시지 추적: 세션 내 모든 메시지 히스토리 유지
 *
 * 실행: npm run sample-02
 */

import readline from "node:readline/promises";
import {
	type AIMessage,
	type BaseMessage,
	HumanMessage,
	SystemMessage,
	ToolMessage,
} from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
import { SessionManager } from "../sample-02/session.js";

dotenv.config();

// ========== Tool Manager ==========

const toolManager = new ToolManager();

// ========== Session Manager ==========

const sessionManager = new SessionManager();

// ========== State 정의 (재사용 가능) ==========

// Sample-02부터 사용되는 기본 GraphState
// Sample-03, 04, 05에서 이를 import하여 재사용
export const GraphState = Annotation.Root({
	sessionId: Annotation<string>({
		reducer: (_, next) => next, // 덮어쓰기
		default: () => "",
	}),
	iterations: Annotation<number>({
		reducer: (_, next) => next, // 덮어쓰기
		default: () => 0,
	}),
});

// Sample-03부터 사용되는 확장 GraphState (Command 지원)
// CommandResult 타입은 sample-03/commands.ts에서 import
export const GraphStateWithCommand = Annotation.Root({
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
});

// ========== 노드 정의 (재사용 가능) ==========

/**
 * createCallAgent: Agent 노드 팩토리 함수
 *
 * SessionManager와 ToolManager를 주입받아 callAgent 노드 함수를 생성합니다.
 * Sample-03, 04, 05에서 재사용됩니다.
 */
export function createCallAgent(
	sessionManager: SessionManager,
	toolManager: ToolManager,
) {
	return async (state: typeof GraphState.State) => {
		const currentIteration = state.iterations + 1;
		console.log(`\n📍 [Agent 노드] 반복 ${currentIteration}`);

		const model = new ChatOpenAI({
			modelName: process.env.OPENAI_MODEL || "gpt-5",
			temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "1"),
		}).bindTools(toolManager.getToolSchemas());

		// SessionManager에서 메시지 가져오기
		const messages = sessionManager.getMessages(state.sessionId);
		const response = await model.invoke(messages);

		// tool_calls가 있으면 로그
		if (response.tool_calls && response.tool_calls.length > 0) {
			console.log(
				`  💭 [AI 판단] ${response.tool_calls.length}개 Tool 호출 필요`,
			);
		} else {
			console.log(`  ✅ [AI 판단] 최종 응답 생성`);
		}

		// SessionManager에 AI 응답 추가
		sessionManager.addMessage(response, state.sessionId);

		return {
			iterations: currentIteration,
		};
	};
}

/**
 * createExecuteTools: Tools 노드 팩토리 함수
 *
 * SessionManager와 ToolManager를 주입받아 executeTools 노드 함수를 생성합니다.
 * Sample-03, 04, 05에서 재사용됩니다.
 */
export function createExecuteTools(
	sessionManager: SessionManager,
	toolManager: ToolManager,
) {
	return async (state: typeof GraphState.State) => {
		console.log(`\n🔧 [Tools 노드] Tool 실행`);

		// SessionManager에서 마지막 메시지 가져오기
		const messages = sessionManager.getMessages(state.sessionId);
		const lastMessage = messages[messages.length - 1] as AIMessage;

		if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
			return {};
		}

		const toolMessages: BaseMessage[] = [];

		for (const toolCall of lastMessage.tool_calls) {
			const toolMessage = await toolManager.executeTool(
				toolCall.name,
				toolCall.args,
				toolCall.id || "",
			);
			toolMessages.push(...toolMessage);
		}

		// SessionManager에 Tool 결과 추가
		sessionManager.addMessages(toolMessages, state.sessionId);

		return {};
	};
}

// Sample-02에서 사용하는 노드 인스턴스 (팩토리로 생성)
const callAgent = createCallAgent(sessionManager, toolManager);
const executeTools = createExecuteTools(sessionManager, toolManager);

// ========== 라우팅 로직 (재사용 가능) ==========

/**
 * createShouldContinue: 라우터 팩토리 함수
 *
 * SessionManager를 주입받아 shouldContinue 라우터를 생성합니다.
 * Sample-03, 04에서 재사용됩니다.
 */
export function createShouldContinue(
	sessionManager: SessionManager,
	maxIterations: number = 10,
) {
	return (state: typeof GraphState.State): string => {
		// 최대 반복 체크 (먼저 확인)
		if (state.iterations >= maxIterations) {
			console.log(`\n⚠️  [Router] 최대 반복 도달 (${maxIterations}회)`);
			return END;
		}

		// SessionManager에서 마지막 메시지 가져오기
		const messages = sessionManager.getMessages(state.sessionId);
		const lastMessage = messages[messages.length - 1] as AIMessage;

		// Tool 호출이 있으면 tools 노드로
		if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
			console.log(`  🔀 [Router] → tools 노드`);
			return "tools";
		}

		// 없으면 종료
		console.log(`  🔀 [Router] → END`);
		return END;
	};
}

// Sample-02에서 사용하는 라우터 인스턴스
const shouldContinue = createShouldContinue(sessionManager);

// ========== 그래프 구성 ==========

function createAgent() {
	// Method chaining으로 타입 추론 개선
	const workflow = new StateGraph(GraphState)
		.addNode("agent", callAgent)
		.addNode("tools", executeTools)
		.addEdge(START, "agent")
		.addConditionalEdges("agent", shouldContinue, {
			tools: "tools",
			[END]: END,
		})
		.addEdge("tools", "agent");

	return workflow.compile();
}

async function main() {
	console.log("🎯 Sample 02: 대화 세션 관리자 구현\n");
	console.log("=".repeat(60));
	console.log("그래프 구조:");
	console.log("  [START] → [agent] ⇄ [tools]");
	console.log("                ↓");
	console.log("              [END]");
	console.log("=".repeat(60));

	// 새 세션 생성 (sample-02에서는 항상 신규 세션)
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();

	// 시스템 메시지 추가
	sessionManager.addMessage(
		new SystemMessage("당신은 파일 작업 어시스턴트입니다."),
	);

	// 사용자 입력 받기
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const userInput = await rl.question(
		"\n💬 실행할 작업을 입력하세요 (Enter = 기본 데모): ",
	);
	rl.close();

	const defaultPrompt =
		"sample-02-test.txt에 'Hello from SessionManager!'를 쓰고, 읽어서 알려줘.";
	const userPrompt = userInput.trim() || defaultPrompt;

	console.log(`\n📝 실행 작업: ${userPrompt}\n`);
	console.log("=".repeat(60));

	// 사용자 메시지를 세션에 추가
	sessionManager.addMessage(new HumanMessage(userPrompt));

	const app = createAgent();

	// Agent 실행 (sessionId만 전달)
	const result = await app.invoke({
		sessionId: sessionId,
		iterations: 0,
	});

	console.log(`\n${"=".repeat(60)}`);
	console.log("🤖 최종 AI 응답:");
	const messages = sessionManager.getMessages();
	const lastMessage = messages[messages.length - 1];
	console.log(lastMessage.content);
	console.log("=".repeat(60));

	console.log(
		`\n📊 통계: ${result.iterations}번 반복, ${sessionManager.getMessageCount()}개 메시지 (세션 저장됨)`,
	);

	// 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession();

	console.log("\n💡 SessionManager의 장점:");
	console.log("  1. 대화 기록 관리: 메시지 히스토리 자동 추적");
	console.log("  2. 다중 세션: 여러 대화 동시 관리 가능");
	console.log("  3. 영속성: 파일 저장/로드로 세션 유지");
	console.log("  4. 메타데이터: 세션별 컨텍스트 저장");
	console.log("  5. 확장성: 추후 멀티턴 대화 구현 기반\n");

	console.log("🚀 다음: npm run sample-03 (Custom Command 시스템)");
}

// 직접 실행될 때만 main() 호출 (import 시에는 실행 안 함)
if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
