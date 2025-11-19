/**
 * MCP Manager: MCP 서버 관리 및 Tool 동적 등록
 *
 * 핵심 기능:
 * 1. 소스코드에 정의된 MCP_SERVERS 설정 사용
 * 2. stdio transport로 MCP 서버 연결
 * 3. MCP Tools만 ToolManager에 등록 (Resources/Prompts 무시)
 *
 * 학습 포인트:
 * - MCP (Model Context Protocol)란?
 *   : AI 애플리케이션과 외부 시스템을 연결하는 표준 프로토콜
 * - stdio transport: 표준 입출력을 통한 프로세스 간 통신
 * - 동적 Tool 등록: 런타임에 외부 도구를 시스템에 통합
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolManager } from "../sample-01/tools.js";
import { ToolMessage } from "@langchain/core/messages";

/**
 * MCP 서버 설정 (소스코드에 직접 정의)
 *
 * 각 서버는 command와 args로 실행됩니다.
 * 예: npx -y @modelcontextprotocol/server-filesystem /tmp
 *
 * 더 많은 MCP 서버는 여기서 찾을 수 있습니다:
 * https://github.com/modelcontextprotocol/servers
 */
const MCP_SERVERS: Record<
	string,
	{
		command: string;
		args: string[];
		description?: string;
	}
> = {
	// 예제: Context7 MCP 서버 (주석 처리하여 비활성화 가능)
	context7: {
		command: "npx",
		args: ["-y", "@upstash/context7-mcp"],
		description: "Context7 문서 검색 서버",
	},

	// 예제: filesystem 서버 (파일 시스템 접근)
	// filesystem: {
	// 	command: "npx",
	// 	args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
	// 	description: "파일 시스템 접근 (읽기/쓰기)",
	// },

	// 예제: 더 많은 MCP 서버 추가
	// brave_search: {
	//   command: "npx",
	//   args: ["-y", "@modelcontextprotocol/server-brave-search"],
	//   description: "Brave 검색 엔진",
	// },
};

/**
 * 문자열을 snake_case로 변환
 *
 * 예: "MyToolName" -> "my_tool_name"
 *     "my-tool-name" -> "my_tool_name"
 *     "My Tool Name" -> "my_tool_name"
 */
function toSnakeCase(str: string): string {
	return str
		.replace(/([A-Z])/g, "_$1") // 대문자 앞에 _
		.replace(/[-\s]+/g, "_") // 하이픈과 공백을 _로
		.replace(/^_/, "") // 시작 부분의 _ 제거
		.toLowerCase(); // 전체 소문자로
}

/**
 * MCP Tool의 JSON Schema를 OpenAI API 형식의 ToolSchema로 변환
 *
 * MCP는 JSON Schema를 사용하고, ToolManager는 OpenAI API 형식을 사용합니다.
 * 이 함수는 MCP Tool을 ToolManager가 이해할 수 있는 형식으로 변환합니다.
 *
 * Tool 이름 충돌 방지:
 * - {서버이름}_{tool이름} 형식으로 생성
 * - 모두 snake_case로 변환 (예: filesystem_read_file)
 *
 * 학습 목적이므로 기본적인 변환만 수행합니다.
 */
function convertMcpToolToToolSchema(
	serverName: string,
	mcpTool: {
		name: string;
		description?: string;
		inputSchema: any;
	},
): import("../sample-01/tools.js").ToolSchema {
	// inputSchema가 없으면 빈 object schema 생성
	const inputSchema = mcpTool.inputSchema || {
		type: "object",
		properties: {},
		required: [],
	};

	// Tool 이름을 {서버이름}_{tool이름} 형식으로 생성 (snake_case)
	const serverNameSnake = toSnakeCase(serverName);
	const toolNameSnake = toSnakeCase(mcpTool.name);
	const fullToolName = `${serverNameSnake}_${toolNameSnake}`;

	return {
		type: "function",
		function: {
			name: fullToolName,
			description:
				mcpTool.description || `MCP Tool from ${serverName}: ${mcpTool.name}`,
			parameters: {
				type: "object",
				properties: inputSchema.properties || {},
				required: inputSchema.required || [],
			},
		},
	};
}

/**
 * MCPManager: MCP 서버들과 연결하고 Tools를 ToolManager에 등록
 *
 * 동작 흐름:
 * 1. MCP_SERVERS 설정을 순회
 * 2. 각 서버마다 stdio transport로 프로세스 실행
 * 3. MCP Client를 통해 연결
 * 4. listTools() 호출하여 사용 가능한 도구 목록 가져오기
 * 5. 각 Tool을 ToolManager에 동적 등록
 * 6. AI가 Tool을 호출하면 MCP Client를 통해 실제 실행
 */
export class MCPManager {
	private clients = new Map<string, Client>();

	constructor(private toolManager: ToolManager) {}

	/**
	 * 모든 MCP 서버 초기화 및 Tool 등록
	 */
	async initialize() {
		console.log("\n🔌 MCP 서버 초기화 중...");

		// MCP_SERVERS가 비어있으면 스킵
		if (Object.keys(MCP_SERVERS).length === 0) {
			console.log("  ⚠️  MCP_SERVERS가 비어있습니다.");
			console.log("  💡 mcp-manager.ts에서 MCP_SERVERS를 설정하세요.");
			return;
		}

		// 각 서버별로 연결 및 Tool 등록
		for (const [serverName, config] of Object.entries(MCP_SERVERS)) {
			try {
				console.log(`\n  📡 서버 연결 중: ${serverName}`);
				if (config.description) {
					console.log(`     설명: ${config.description}`);
				}
				console.log(`     명령어: ${config.command} ${config.args.join(" ")}`);

				// 1. stdio transport 생성
				//    이 transport는 command를 실행하고 stdin/stdout을 통해 통신합니다.
				const transport = new StdioClientTransport({
					command: config.command,
					args: config.args,
				});

				// 2. MCP Client 생성
				const client = new Client({
					name: "cocodex-client",
					version: "1.0.0",
				});

				// 3. 연결
				await client.connect(transport);
				this.clients.set(serverName, client);

				// 4. 사용 가능한 Tools 목록 가져오기
				const toolsResponse = await client.listTools();
				console.log(
					`     ✅ 연결 성공! ${toolsResponse.tools.length}개 Tool 발견`,
				);

				// 5. 각 Tool을 ToolManager에 등록
				for (const mcpTool of toolsResponse.tools) {
					// MCP Tool을 OpenAI API 형식의 ToolSchema로 변환
					// serverName을 전달하여 {서버이름}_{tool이름} 형식으로 생성
					const toolSchema = convertMcpToolToToolSchema(serverName, mcpTool);

					// Tool Executor 생성
					// AI가 이 Tool을 호출하면 MCP Client를 통해 실제 서버로 전달됩니다.
					// 주의: MCP 서버에는 원본 tool 이름(mcpTool.name)으로 호출해야 합니다.
					const toolExecutor = async (
						args: Record<string, unknown>,
						toolCallId?: string,
					) => {
						try {
							// MCP 서버의 Tool 호출 (원본 이름 사용)
							const result = await client.callTool({
								name: mcpTool.name,
								arguments: args,
							});

							// 결과를 ToolMessage 형태로 반환
							// content는 배열이므로 텍스트만 추출
							const content = result.content as Array<{
								type: string;
								text?: string;
							}>;
							const contentText = content
								.map((item) => {
									if (item.type === "text" && item.text) {
										return item.text;
									}
									return JSON.stringify(item);
								})
								.join("\n");

							return [
								new ToolMessage({
									content: contentText,
									tool_call_id: toolCallId || "", // toolCallId 올바르게 전달
								}),
							];
						} catch (error) {
							// Tool 실행 실패 시 에러 메시지 반환
							const errorMessage =
								error instanceof Error ? error.message : String(error);
							return [
								new ToolMessage({
									content: `Tool 실행 실패: ${errorMessage}`,
									tool_call_id: toolCallId || "",
								}),
							];
						}
					};

					// ToolManager에 등록
					this.toolManager.registerTool(toolSchema, toolExecutor);
					console.log(`        - ${mcpTool.name}`);
				}
			} catch (error) {
				console.error(`  ❌ 서버 연결 실패: ${serverName}`);
				console.error(
					`     에러: ${error instanceof Error ? error.message : String(error)}`,
				);
				// 한 서버가 실패해도 계속 진행
			}
		}

		console.log("\n✅ MCP 초기화 완료!");
	}

	/**
	 * 모든 MCP Client 종료
	 */
	async cleanup() {
		console.log("\n🔌 MCP 서버 연결 종료 중...");
		for (const [serverName, client] of this.clients.entries()) {
			try {
				await client.close();
				console.log(`  ✅ ${serverName} 종료`);
			} catch (error) {
				console.error(`  ❌ ${serverName} 종료 실패:`, error);
			}
		}
		this.clients.clear();
	}

	/**
	 * 연결된 MCP 서버 목록 반환
	 */
	getConnectedServers(): string[] {
		return Array.from(this.clients.keys());
	}
}
