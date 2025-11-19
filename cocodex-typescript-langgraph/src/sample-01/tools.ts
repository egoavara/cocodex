/**
 * 공통 Tool Manager 시스템
 *
 * 동적으로 Tool을 추가/관리할 수 있는 시스템
 * MCP 연동 등 확장 가능한 구조
 *
 * 기본 Tool 세트:
 * - read_file: 파일 읽기
 * - write_file: 파일 쓰기
 * - list_dir: 디렉토리 목록 조회
 * - execute: CLI 명령 실행
 */

import { exec } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import { type BaseMessage, ToolMessage } from "@langchain/core/messages";

const execAsync = promisify(exec);

// ========== Tool 타입 정의 ==========

export interface ToolSchema {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: {
			type: "object";
			properties: Record<string, unknown>;
			required: string[];
		};
	};
}

// biome-ignore lint/suspicious/noExplicitAny: Tool arguments are dynamic from OpenAI API
export type ToolExecutor = (args: any, toolCallId?: string) => Promise<string | BaseMessage[] | BaseMessage>;

// ========== ToolManager ==========

export class ToolManager {
	private tools: Map<string, ToolSchema> = new Map();
	private executors: Map<string, ToolExecutor> = new Map();

	constructor() {
		// 기본 툴 자동 등록
		this.registerDefaultTools();
	}

	// 툴 등록
	registerTool(schema: ToolSchema, executor: ToolExecutor): void {
		const toolName = schema.function.name;
		this.tools.set(toolName, schema);
		this.executors.set(toolName, executor);
		console.log(`  ✅ Tool 등록: ${toolName}`);
	}

	// 툴 제거
	unregisterTool(toolName: string): boolean {
		const removed = this.tools.delete(toolName);
		this.executors.delete(toolName);
		return removed;
	}

	// 툴 스키마 배열 반환 (OpenAI API용)
	getToolSchemas(): ToolSchema[] {
		return Array.from(this.tools.values());
	}

	// 툴 실행
	// biome-ignore lint/suspicious/noExplicitAny: Tool arguments are dynamic from OpenAI API
	async executeTool(
		toolName: string,
		args: any,
		toolCallId?: string,
	): Promise<BaseMessage[]> {
		console.log(`    🔧 [Tool] ${toolName}(${JSON.stringify(args)})`);

		const executor = this.executors.get(toolName);
		if (!executor) {
			return [new ToolMessage({
				tool_call_id: toolCallId || "",
				content: `Unknown tool: ${toolName}`,
			})];
		}

		try {
			const result = await executor(args, toolCallId);

			// string인 경우만 ToolMessage로 래핑
			if (typeof result === "string") {
				return [new ToolMessage({
					tool_call_id: toolCallId || "",
					content: result,
				})];
			}
			if (Array.isArray(result)) {
				return result;
			}

			// BaseMessage인 경우 (이미지 등) 그대로 반환
			return [result];
		} catch (error) {
			const errorMsg = `오류: ${error}`;
			console.log(`    ❌ [Error] ${errorMsg}`);
			return [new ToolMessage({
				tool_call_id: toolCallId || "",
				content: errorMsg,
			})];
		}
	}

	// 툴 존재 여부 확인
	hasTool(toolName: string): boolean {
		return this.tools.has(toolName);
	}

	// 모든 툴 이름 반환
	getToolNames(): string[] {
		return Array.from(this.tools.keys());
	}

	// 기본 툴 등록
	private registerDefaultTools(): void {
		// read_file
		this.registerTool(
			{
				type: "function",
				function: {
					name: "read_file",
					description: "파일 내용 읽기",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "읽을 파일 경로" },
						},
						required: ["path"],
					},
				},
			},
			async (args) => {
				const content = await fs.readFile(args.path, "utf-8");
				console.log(`    ✅ [Result] 읽기 성공 (${content.length}자)`);
				return content;
			},
		);

		// write_file
		this.registerTool(
			{
				type: "function",
				function: {
					name: "write_file",
					description: "파일에 내용 쓰기",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "쓸 파일 경로" },
							content: { type: "string", description: "파일에 쓸 내용" },
						},
						required: ["path", "content"],
					},
				},
			},
			async (args) => {
				await fs.writeFile(args.path, args.content, "utf-8");
				console.log(`    ✅ [Result] 쓰기 완료`);
				return `${args.path}에 작성 완료`;
			},
		);

		// list_dir
		this.registerTool(
			{
				type: "function",
				function: {
					name: "list_dir",
					description: "디렉토리의 파일 및 폴더 목록 조회",
					parameters: {
						type: "object",
						properties: {
							path: { type: "string", description: "조회할 디렉토리 경로" },
						},
						required: ["path"],
					},
				},
			},
			async (args) => {
				const entries = await fs.readdir(args.path, { withFileTypes: true });
				const result = entries.map((entry) => {
					const type = entry.isDirectory() ? "📁" : "📄";
					return `${type} ${entry.name}`;
				});
				console.log(`    ✅ [Result] ${entries.length}개 항목 발견`);
				return result.join("\n");
			},
		);

		// execute
		this.registerTool(
			{
				type: "function",
				function: {
					name: "execute",
					description: "CLI 명령 실행 (주의: 위험한 명령은 실행하지 마세요)",
					parameters: {
						type: "object",
						properties: {
							command: { type: "string", description: "실행할 CLI 명령어" },
						},
						required: ["command"],
					},
				},
			},
			async (args) => {
				const { stdout, stderr } = await execAsync(args.command, {
					timeout: 30000, // 30초 타임아웃
				});
				const output = stdout || stderr;
				console.log(`    ✅ [Result] 실행 완료 (${output.length}자)`);
				return output || "명령 실행 완료 (출력 없음)";
			},
		);
	}
}
