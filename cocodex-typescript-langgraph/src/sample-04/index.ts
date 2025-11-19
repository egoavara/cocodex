/**
 * Sample 04: Context File Loading + SessionManager + CustomCommand
 *
 * cocoagent.md 컨텍스트 파일을 재귀적으로 찾아서 로드하고
 * SessionManager로 대화를 관리하며 CustomCommand를 지원
 *
 * 핵심 개념:
 * 1. 재귀적 탐색: 부모 폴더를 순회하며 cocoagent.md 자동 발견
 * 2. 계층적 컨텍스트: 부모 → 현재 순서로 컨텍스트 구성
 * 3. 첫 번째 User Message로 주입: AI가 컨텍스트를 기반으로 작동
 * 4. SessionManager: 대화 히스토리를 세션에 저장
 * 5. CustomCommand: /명령어 형식 검증 및 실행
 * 6. readline: 사용자 입력 (빈 입력 시 기본값 사용)
 *
 * 실행: npm run sample-04
 */

import readline from "node:readline/promises";
import { HumanMessage } from "@langchain/core/messages";
import { END, START, StateGraph } from "@langchain/langgraph";
import dotenv from "dotenv";
import { ToolManager } from "../sample-01/tools.js";
// ✅ Sample-02에서 재사용 가능한 컴포넌트 import (Sample-03을 거치지 않고 직접)
import {
	createCallAgent,
	createExecuteTools,
	createShouldContinue,
	GraphState,
} from "../sample-02/index.js";
import { SessionManager } from "../sample-02/session.js";
import { CommandRegistry } from "../sample-03/commands.js";
import { ContextManager } from "../sample-04/context.js";

dotenv.config();

// ========== Tool Manager & Context Manager & Session Manager ==========

const toolManager = new ToolManager();
const contextManager = new ContextManager();
const sessionManager = new SessionManager();
const commandRegistry = new CommandRegistry();

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
	console.log("🎯 Sample 04: Context File Loading\n");
	console.log("=".repeat(60));
	console.log("특징:");
	console.log("  - 재귀적으로 부모 폴더를 탐색하여 cocoagent.md 자동 발견");
	console.log("  - 부모 → 현재 순서로 계층적 컨텍스트 구성");
	console.log("  - 첫 번째 User 메시지로 컨텍스트 주입");
	console.log("  - SessionManager로 대화 관리");
	console.log("  - CustomCommand 검증 및 실행\n");
	console.log("=".repeat(60));

	// 1. CLI 부팅 시점에 컨텍스트 및 명령어 로드
	const initialContext = await contextManager.buildInitialUserMessage();
	await commandRegistry.loadCommands();
	console.log(`\n✅ 컨텍스트 로드 완료! (${initialContext.length}자)`);
	console.log(commandRegistry.getCommandDescriptions());
	console.log("=".repeat(60));

	// 2. 사용자 입력 받기
	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout,
	});

	const userInput = await rl.question(
		"\n💬 질문 또는 명령어를 입력하세요 (Enter = 기본 테스트): ",
	);
	rl.close();

	const defaultInput =
		"이 프로젝트의 목표가 무엇이라고 설명되어 있나요? 간단히 요약해주세요.";
	const input = userInput.trim() || defaultInput;

	console.log(`\n📝 입력: ${input}\n`);
	console.log("=".repeat(60));

	// 3. 새 세션 생성
	console.log("\n📦 세션 관리:");
	const sessionId = sessionManager.createSession();

	// 4. 컨텍스트를 첫 번째 User 메시지로 주입
	sessionManager.addMessage(new HumanMessage(initialContext), sessionId);

	// 5. CustomCommand 검증 및 처리
	let finalPrompt = input;

	if (commandRegistry.isCommand(input)) {
		const parsed = commandRegistry.parseCommand(input);
		if (parsed) {
			const { commandName, args } = parsed;

			// 명령어 실행
			const result = await commandRegistry.execute(commandName, args, {
				sessionManager,
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

			console.log(`\n🎯 명령어: /${commandName}`);
			console.log(`📝 인자: ${args}`);
			console.log(`\n💬 생성된 프롬프트:\n${finalPrompt}\n`);
			console.log("=".repeat(60));
		}
	} else {
		console.log(`\n💬 일반 질문: ${finalPrompt}\n`);
		console.log("=".repeat(60));
	}

	// 6. 사용자 메시지 추가
	sessionManager.addMessage(new HumanMessage(finalPrompt), sessionId);

	// 7. Agent 생성 및 실행
	console.log("\n🤖 AI 처리 중...\n");
	const app = createAgent();

	await app.invoke({
		sessionId: sessionId,
		iterations: 0,
	});

	// 8. 최종 응답 가져오기
	const messages = sessionManager.getMessages(sessionId);
	const lastMessage = messages[messages.length - 1];
	console.log(`✅ AI 응답:\n${lastMessage.content}\n`);
	console.log("=".repeat(60));

	// 9. 세션 저장
	console.log("\n💾 세션 저장:");
	await sessionManager.saveSession(sessionId);

	console.log("\n💡 Sample 04 핵심 학습 내용:");
	console.log("  1. 재귀적 탐색: 부모 폴더를 순회하며 cocoagent.md 발견");
	console.log("  2. 계층적 구성: 부모 → 현재 순서로 컨텍스트 병합");
	console.log("  3. 첫 번째 HumanMessage로 컨텍스트 주입");
	console.log("  4. CustomCommand 검증 및 실행");
	console.log("  5. SessionManager로 대화 히스토리 관리\n");

	console.log("🚀 다음: npm run sample-05 (SubAgent Pattern)");
	console.log("\n💡 사용 예시:");
	console.log("  (엔터)                         → 기본 테스트 질문");
	console.log("  /analyze src/sample-04/index.ts → analyze 명령어 실행");
	console.log("  프로젝트 구조를 설명해줘         → 일반 질문");
}

main().catch(console.error);
