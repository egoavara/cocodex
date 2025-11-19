/**
 * Sample 03: 사용자 정의 Custom Command 시스템
 *
 * .cocodex/commands/*.md 파일로 커스텀 명령어를 정의하는 시스템
 *
 * 핵심 개념:
 * 1. 파일 기반 명령어: .cocodex/commands/{명령어}.md로 정의
 * 2. 플레이스홀더: ${ARGUMENTS} 형식으로 사용자 입력 치환
 * 3. YAML Front Matter: 명령어 설명 (description)
 * 4. AI 프롬프트 생성: 템플릿 치환 후 AI에게 전달
 *
 * 실행: npm run sample-03
 */

import readline from "node:readline/promises";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
// ✅ Sample-02에서 재사용 가능한 컴포넌트 import
import {
	createCallAgent,
	createExecuteTools,
	createShouldContinue,
	GraphState,
} from "../sample-02/index.js";
import { SessionManager } from "../sample-02/session.js";
import { CommandRegistry } from "../sample-03/commands.js";

dotenv.config();

// ========== Tool Manager ==========

const toolManager = new ToolManager();

// ========== Session Manager ==========

const sessionManager = new SessionManager();

// ========== Sample-02의 컴포넌트 재사용 ==========

// Sample-02에서 정의한 팩토리 함수로 노드와 라우터 생성
const callAgent = createCallAgent(sessionManager, toolManager);
const executeTools = createExecuteTools(sessionManager, toolManager);
const shouldContinue = createShouldContinue(sessionManager);

function createAgent() {
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

// ========== 메인 ==========

async function main() {
	const commandRegistry = new CommandRegistry();
	await commandRegistry.loadCommands();

	console.log("\n🎯 Sample 03: 사용자 정의 Custom Command 시스템\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - .cocodex/commands/*.md 파일로 명령어 정의");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: Demonstrating placeholder syntax
	console.log("  - ${ARGUMENTS} 플레이스홀더로 사용자 입력 치환");
	console.log("  - /명령어 형식으로 직접 호출");
	console.log(
		"  - AI 에이전트가 Tool 사용 가능 (read_file, write_file, list_dir, execute)\n",
	);
	console.log("=".repeat(60));

	console.log(`\n${commandRegistry.getCommandDescriptions()}`);
	console.log(`\n${"=".repeat(60)}`);

	// 사용자 입력 받기
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const userInput = await rl.question(
		"\n💬 명령어를 입력하세요 (엔터: /analyze src/sample-03/index.ts): ",
	);
	rl.close();

	// 빈 입력이면 기본 명령어 실행
	const input = userInput.trim() || "/analyze src/sample-03/index.ts";

	// 명령어 파싱 (새로운 메서드 사용)
	if (!commandRegistry.isCommand(input)) {
		console.log("\n❌ 올바른 형식: /명령어 <인자>");
		console.log(commandRegistry.getCommandDescriptions());
		return;
	}

	const parsed = commandRegistry.parseCommand(input);
	if (!parsed) {
		console.log("\n❌ 명령어 파싱 실패");
		console.log(commandRegistry.getCommandDescriptions());
		return;
	}

	const { commandName, args } = parsed;

	// 명령어 실행
	const result = await commandRegistry.execute(commandName, args);

	// 에러 처리
	if (result.type === "error") {
		console.log(`\n${result.message}`);
		console.log(commandRegistry.getCommandDescriptions());
		return;
	}

	// prompt 타입이 아니면 (Sample-03에서는 모두 template 타입이므로 prompt만 반환됨)
	if (result.type !== "prompt") {
		console.log("\n❌ 예상치 못한 명령어 결과 타입");
		return;
	}

	const prompt = result.message;

	console.log(`\n${"=".repeat(60)}`);
	console.log(`🎯 명령어: /${commandName}`);
	console.log(`📝 인자: ${args}`);
	console.log(`\n💬 생성된 프롬프트:\n${prompt}`);
	console.log(`\n${"=".repeat(60)}`);

	// 새 세션 생성 (sample-03에서는 항상 신규 세션)
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();

	// 시스템 메시지 및 사용자 메시지 추가
	sessionManager.addMessage(
		new SystemMessage("당신은 코드 분석 전문 AI입니다."),
		sessionId,
	);
	sessionManager.addMessage(new HumanMessage(prompt), sessionId);

	// AI 에이전트에게 전달
	console.log("\n🤖 AI 에이전트 실행 중...\n");

	const app = createAgent();

	await app.invoke({
		sessionId: sessionId,
		iterations: 0,
	});

	// SessionManager에서 최종 응답 가져오기
	const messages = sessionManager.getMessages(sessionId);
	const lastMessage = messages[messages.length - 1];
	console.log(`\n🤖 AI 응답:\n${lastMessage.content}\n`);
	console.log(`${"=".repeat(60)}`);

	console.log("\n💡 Sample 03의 핵심 학습 내용:");
	console.log("  1. 커스텀 명령어 시스템: /명령어 <인자> 형식");
	// biome-ignore lint/suspicious/noTemplateCurlyInString: Demonstrating placeholder syntax
	console.log("  2. 템플릿 플레이스홀더: ${ARGUMENTS} 자동 치환");
	console.log("  3. AI 에이전트 + Tool 시스템 통합");
	console.log("  4. 공통 Tool 사용: read_file, write_file, list_dir, execute");
	console.log("  5. LangGraph 워크플로우: Agent ↔ Tools 반복\n");

	console.log("🚀 다음: npm run sample-04 (Context File Loading)");
	console.log("\n💡 사용 예시:");
	console.log(
		"  (엔터)                        → /analyze src/sample-03/index.ts",
	);
	console.log("  /analyze package.json         → analyze 명령어 실행");
	console.log("  /review src/sample-03/index.ts → review 명령어 실행");
	console.log("  /explain src/sample-01/index.ts → explain 명령어 실행");
}

main().catch(console.error);
