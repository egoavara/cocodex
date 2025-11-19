/**
 * Sample 00: Tool Loop의 핵심 개념
 *
 * OpenAI Function Calling과 Tool Loop의 기본 메커니즘을 이해합니다.
 *
 * 핵심 포인트:
 * 1. AI가 "함수를 호출해야 한다"고 판단하는 방식
 * 2. Tool 실행 후 결과를 다시 AI에게 전달하는 패턴
 * 3. 멀티턴: AI → Tool → AI → (반복) → 최종 응답
 *
 * 실행: npm run sample-00
 */

import { promises as fs } from "node:fs";
import readline from "node:readline/promises";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const openai = new OpenAI({
	apiKey: process.env.OPENAI_API_KEY,
});

// Tool 정의: AI에게 "이런 함수를 사용할 수 있다"고 알려줌
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
	{
		type: "function",
		function: {
			name: "read_file",
			description: "파일의 내용을 읽습니다",
			parameters: {
				type: "object",
				properties: {
					path: {
						type: "string",
						description: "읽을 파일의 경로",
					},
				},
				required: ["path"],
			},
		},
	},
	{
		type: "function",
		function: {
			name: "write_file",
			description: "파일에 내용을 씁니다",
			parameters: {
				type: "object",
				properties: {
					path: { type: "string", description: "파일 경로" },
					content: { type: "string", description: "파일 내용" },
				},
				required: ["path", "content"],
			},
		},
	},
];

// Tool 실행 함수
// biome-ignore lint/suspicious/noExplicitAny: Tool arguments are dynamic from OpenAI API
async function executeTool(toolName: string, args: any): Promise<string> {
	console.log(`    🔧 [Tool 실행] ${toolName}(${JSON.stringify(args)})`);

	try {
		switch (toolName) {
			case "read_file": {
				const content = await fs.readFile(args.path, "utf-8");
				console.log(
					`    📄 [Tool 결과] 파일 읽기 성공 (${content.length} 글자)`,
				);
				return content;
			}

			case "write_file":
				await fs.writeFile(args.path, args.content, "utf-8");
				console.log(`    ✅ [Tool 결과] 파일 쓰기 완료`);
				return `파일 ${args.path}에 작성 완료`;

			default:
				throw new Error(`Unknown tool: ${toolName}`);
		}
	} catch (error) {
		const errorMsg = `오류: ${error}`;
		console.log(`    ❌ [Tool 오류] ${errorMsg}`);
		return errorMsg;
	}
}

async function main() {
	console.log("🎯 Sample 00: Tool Loop의 핵심 개념\n");
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

	// 기본 프롬프트
	const defaultPrompt =
		"sample-00-test.txt 파일에 'Hello from Cocodex Sample 00!'를 쓰고, 그 파일을 다시 읽어서 내용을 알려줘.";
	const userPrompt = userInput.trim() || defaultPrompt;

	console.log(`\n📝 실행 작업: ${userPrompt}\n`);
	console.log("=".repeat(60));

	const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: "당신은 파일 작업을 도와주는 어시스턴트입니다.",
		},
		{
			role: "user",
			content: userPrompt,
		},
	];

	let iteration = 0;
	const MAX_ITERATIONS = 10;

	// Tool Loop: AI가 더 이상 tool을 호출하지 않을 때까지 반복
	while (iteration < MAX_ITERATIONS) {
		iteration++;
		console.log(`\n📍 [반복 ${iteration}] AI 호출 중...`);

		const response = await openai.chat.completions.create({
			model: process.env.OPENAI_MODEL || "gpt-5o",
			messages: messages,
			tools: tools,
			tool_choice: "auto", // AI가 필요하면 tool 사용, 아니면 일반 응답
			temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.2"),
		});

		const responseMessage = response.choices[0].message;
		messages.push(responseMessage);

		// Case 1: AI가 tool을 호출하려고 함
		if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
			console.log(
				`  💭 [AI 판단] ${responseMessage.tool_calls.length}개의 Tool 호출 필요`,
			);

			// 각 tool call 실행
			for (const toolCall of responseMessage.tool_calls) {
				const toolName = toolCall.function.name;
				const toolArgs = JSON.parse(toolCall.function.arguments);

				// 실제 함수 실행
				const result = await executeTool(toolName, toolArgs);

				// 결과를 AI에게 다시 전달 (중요!)
				messages.push({
					role: "tool",
					tool_call_id: toolCall.id,
					content: result,
				});
			}

			// 다음 반복으로 계속 (AI가 tool 결과를 보고 다시 판단)
			continue;
		}

		// Case 2: AI가 최종 응답을 생성함
		console.log(`  ✅ [AI 판단] 최종 응답 생성\n`);
		console.log("=".repeat(60));
		console.log("🤖 최종 AI 응답:");
		console.log(responseMessage.content);
		console.log("=".repeat(60));
		break;
	}

	if (iteration >= MAX_ITERATIONS) {
		console.log("\n⚠️  최대 반복 횟수 도달 (무한 루프 방지)");
	}

	console.log(`\n📊 통계: ${iteration}번 반복, 총 ${messages.length}개 메시지`);

	console.log("\n💡 핵심 개념 정리:");
	console.log("  1. Tool Schema: JSON Schema로 함수 시그니처를 AI에게 설명");
	console.log(
		"  2. tool_calls: AI의 응답에 '이 함수를 호출하라'는 지시가 포함됨",
	);
	console.log("  3. role: 'tool': Tool 실행 결과를 AI에게 피드백");
	console.log("  4. Loop: AI → Tool → AI → ... → 최종 응답");
	console.log("  5. 자율성: AI가 스스로 tool 사용 여부와 순서를 결정\n");

	console.log("🚀 다음 단계: npm run sample-01 (LangGraph로 이 패턴을 구조화)");
}

main().catch(console.error);
