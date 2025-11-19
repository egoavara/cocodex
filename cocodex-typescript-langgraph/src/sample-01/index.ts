/**
 * Sample 01: LangGraph로 Agent 구조화
 *
 * Sample 00의 Tool Loop를 LangGraph로 재구현합니다.
 *
 * 핵심 포인트:
 * 1. StateGraph: 상태 기반 워크플로우
 * 2. Conditional Edge: 조건에 따른 노드 전환
 * 3. 선언적 구조: "무엇을"이 명확, "어떻게"는 프레임워크가 처리
 *
 * 실행: npm run sample-01
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

dotenv.config();

// ========== Tool Manager ==========

const toolManager = new ToolManager();

// ========== State 정의 ==========

const GraphState = Annotation.Root({
	messages: Annotation<BaseMessage[]>({
		reducer: (prev, next) => prev.concat(next), // 메시지 누적
		default: () => [],
	}),
	iterations: Annotation<number>({
		reducer: (_, next) => next, // 덮어쓰기
		default: () => 0,
	}),
});

// ========== 노드 정의 ==========

// Agent 노드: AI 호출
async function callAgent(state: typeof GraphState.State) {
	console.log(`\n📍 [Agent 노드] 반복 ${state.iterations + 1}`);

	const model = new ChatOpenAI({
		modelName: process.env.OPENAI_MODEL || "gpt-5",
		temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "1"),
	}).bindTools(toolManager.getToolSchemas());

	const response = await model.invoke(state.messages);

	// tool_calls가 있으면 로그
	if (response.tool_calls && response.tool_calls.length > 0) {
		console.log(
			`  💭 [AI 판단] ${response.tool_calls.length}개 Tool 호출 필요`,
		);
	} else {
		console.log(`  ✅ [AI 판단] 최종 응답 생성`);
	}

	return {
		messages: [response],
		iterations: state.iterations + 1,
	};
}

// Tools 노드: Tool 실행
async function executeTools(state: typeof GraphState.State) {
	console.log(`\n🔧 [Tools 노드] Tool 실행`);

	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

	if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
		return { messages: [] };
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

	return { messages: toolMessages };
}

// ========== 라우팅 로직 ==========

function shouldContinue(state: typeof GraphState.State): string {
	const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

	// 최대 반복 체크
	if (state.iterations >= 10) {
		console.log(`\n⚠️  [Router] 최대 반복 도달`);
		return END;
	}

	// Tool 호출이 있으면 tools 노드로
	if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
		console.log(`  🔀 [Router] → tools 노드`);
		return "tools";
	}

	// 없으면 종료
	console.log(`  🔀 [Router] → END`);
	return END;
}

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
	console.log("🎯 Sample 01: LangGraph로 Agent 구조화\n");
	console.log("=".repeat(60));
	console.log("그래프 구조:");
	console.log("  [START] → [agent] ⇄ [tools]");
	console.log("                ↓");
	console.log("              [END]");
	console.log("=".repeat(60));

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
		"sample-01-test.txt에 'Hello from LangGraph!'를 쓰고, 읽어서 알려줘.";
	const userPrompt = userInput.trim() || defaultPrompt;

	console.log(`\n📝 실행 작업: ${userPrompt}\n`);
	console.log("=".repeat(60));

	const app = createAgent();

	const result = await app.invoke({
		messages: [
			new SystemMessage("당신은 파일 작업 어시스턴트입니다."),
			new HumanMessage(userPrompt),
		],
		iterations: 0,
	});

	console.log(`\n${"=".repeat(60)}`);
	console.log("🤖 최종 AI 응답:");
	const lastMessage = result.messages[result.messages.length - 1];
	console.log(lastMessage.content);
	console.log("=".repeat(60));

	console.log(
		`\n📊 통계: ${result.iterations}번 반복, ${result.messages.length}개 메시지`,
	);

	console.log("\n💡 LangGraph의 장점:");
	console.log("  1. 선언적: 복잡한 if문 없이 그래프로 표현");
	console.log("  2. 가독성: 노드와 엣지로 흐름이 명확");
	console.log("  3. 디버깅: 각 노드의 입출력을 쉽게 추적");
	console.log("  4. 확장성: 새 노드 추가가 간단");
	console.log("  5. 상태 관리: State로 중앙화\n");

	console.log("🚀 다음: npm run sample-03 (Custom Command 시스템)");
}

main().catch(console.error);
