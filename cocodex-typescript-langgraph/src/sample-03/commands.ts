/**
 * 공통 Custom Command 시스템
 *
 * .cocodex/commands/*.md 파일로 커스텀 명령어를 정의하고 관리
 * 런타임에 람다 함수로 명령어를 동적으로 등록 가능
 *
 * 핵심 기능:
 * - Markdown 파일 기반 명령어 정의 (template 타입)
 * - 람다 함수 기반 명령어 등록 (lambda 타입)
 * - YAML Front Matter로 메타데이터 관리
 * - ${ARGUMENTS} 플레이스홀더 자동 치환
 */

import { promises as fs } from "node:fs";
import path from "node:path";

// ========== CommandResult 타입 시스템 ==========

/**
 * CommandResult: 명령어 실행 결과 타입
 *
 * LangGraph 노드에서 직접 사용할 수 있도록 설계된 타입입니다.
 * 모든 샘플(03~06)에서 재사용됩니다.
 */
export type CommandResult =
	| { type: "prompt"; message: string } // AI에게 전달할 프롬프트
	| { type: "close" } // 대화 종료
	| { type: "executed" } // 실행 완료 (다시 입력 대기)
	| { type: "error"; message: string }; // 에러

// ========== CommandHandler ==========

// biome-ignore lint/suspicious/noExplicitAny: Context is dynamic and can contain any data
export type CommandLambda = (
	args: string,
	context?: any,
) => Promise<CommandResult>;

export interface CommandHandler {
	type: "template" | "lambda";
	description: string;
	// template 타입인 경우: ${ARGUMENTS} 플레이스홀더를 포함한 프롬프트 템플릿
	template?: string;
	// lambda 타입인 경우: 실행할 함수
	handler?: CommandLambda;
}

// ========== CommandRegistry ==========

export class CommandRegistry {
	private commands: Map<string, CommandHandler> = new Map();
	private commandsDir: string;

	constructor(commandsDir: string = ".cocodex/commands") {
		this.commandsDir = commandsDir;
	}

	// .cocodex/commands/*.md 파일을 모두 로드 (template 타입)
	async loadCommands(): Promise<void> {
		try {
			const files = await fs.readdir(this.commandsDir);
			const mdFiles = files.filter((f) => f.endsWith(".md"));

			console.log(
				`\n📂 커스텀 명령어 로딩: ${this.commandsDir} (${mdFiles.length}개 발견)`,
			);

			for (const file of mdFiles) {
				const filePath = path.join(this.commandsDir, file);
				const commandName = path.basename(file, ".md");

				try {
					const content = await fs.readFile(filePath, "utf-8");
					const handler = this.parseCommandFile(content);
					this.commands.set(commandName, handler);
					console.log(`  ✅ ${commandName}: ${handler.description}`);
				} catch (error) {
					console.error(`  ❌ ${file} 로드 실패: ${error}`);
				}
			}

			if (this.commands.size === 0) {
				console.log("  ⚠️  로드된 명령어가 없습니다.");
			}
		} catch (error) {
			console.error(`❌ 명령어 디렉토리 로드 실패: ${error}`);
		}
	}

	// Markdown 파일 파싱 (YAML Front Matter + 본문)
	private parseCommandFile(content: string): CommandHandler {
		const frontMatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
		const match = content.match(frontMatterRegex);

		if (!match) {
			throw new Error("YAML Front Matter가 없습니다");
		}

		const [, frontMatter, template] = match;

		// description만 파싱
		const descMatch = frontMatter.match(/description:\s*(.+)/);
		const description = descMatch ? descMatch[1].trim() : "설명 없음";

		return {
			type: "template",
			description,
			template: template.trim(),
		};
	}

	// 람다 함수로 명령어 등록 (lambda 타입)
	register(
		commandName: string,
		handler: CommandLambda,
		description: string,
	): void {
		this.commands.set(commandName, {
			type: "lambda",
			description,
			handler,
		});
		console.log(`  ✅ 람다 명령어 등록: ${commandName}`);
	}

	// 명령어 실행
	// template 타입: ${ARGUMENTS} 치환 후 CommandResult.prompt 반환
	// lambda 타입: handler 실행 후 CommandResult 반환
	// biome-ignore lint/suspicious/noExplicitAny: Context is dynamic and can contain any data
	async execute(
		commandName: string,
		args: string,
		context?: any,
	): Promise<CommandResult> {
		const command = this.commands.get(commandName);
		if (!command) {
			return {
				type: "error",
				message: `❌ 명령어를 찾을 수 없습니다: ${commandName}`,
			};
		}

		if (command.type === "template") {
			// template 타입: ${ARGUMENTS}를 사용자 입력으로 치환
			if (!command.template) {
				return {
					type: "error",
					message: `❌ 템플릿이 없습니다: ${commandName}`,
				};
			}
			const prompt = command.template.replace(/\$\{ARGUMENTS\}/g, args);
			return {
				type: "prompt",
				message: prompt,
			};
		}

		if (command.type === "lambda") {
			// lambda 타입: handler 실행
			if (!command.handler) {
				return {
					type: "error",
					message: `❌ 핸들러가 없습니다: ${commandName}`,
				};
			}
			return await command.handler(args, context);
		}

		return {
			type: "error",
			message: `❌ 알 수 없는 명령어 타입: ${commandName}`,
		};
	}

	// 명령어 목록 반환
	getCommandDescriptions(): string {
		if (this.commands.size === 0) {
			return "사용 가능한 커스텀 명령어가 없습니다.";
		}

		const descriptions = Array.from(this.commands.entries()).map(
			([name, cmd]) => `  /${name} <arguments>: ${cmd.description}`,
		);

		return `사용 가능한 커스텀 명령어:\n${descriptions.join("\n")}`;
	}

	// 모든 명령어 반환
	getAllCommands(): Map<string, CommandHandler> {
		return this.commands;
	}

	// 특정 명령어 존재 여부 확인
	hasCommand(commandName: string): boolean {
		return this.commands.has(commandName);
	}

	// 사용자 입력이 커맨드인지 확인
	isCommand(input: string): boolean {
		const trimmed = input.trim();
		if (!trimmed.startsWith("/")) {
			return false;
		}

		// /명령어 형식인지 확인
		const match = trimmed.match(/^\/(\w+)(?:\s+(.+))?$/);
		return match !== null;
	}

	// 사용자 입력을 파싱 (명령어 + 인자)
	parseCommand(input: string): { commandName: string; args: string } | null {
		const trimmed = input.trim();
		if (!this.isCommand(trimmed)) {
			return null;
		}

		const match = trimmed.match(/^\/(\w+)(?:\s+(.+))?$/);
		if (!match) {
			return null;
		}

		const [, commandName, args] = match;
		return {
			commandName,
			args: args || "",
		};
	}
}

// ========== LangGraph 노드 팩토리 함수 ==========

/**
 * createParseInputNode: 사용자 입력을 파싱하는 노드
 *
 * State에서 userInput을 읽어서 명령어인지 일반 메시지인지 판단합니다.
 * 명령어인 경우 commandResult를 설정합니다.
 *
 * @param commandRegistry - 명령어 레지스트리
 */
export function createParseInputNode(commandRegistry: CommandRegistry) {
	// biome-ignore lint/suspicious/noExplicitAny: State type varies by sample
	return async (state: any) => {
		const userInput = state.userInput;

		if (!userInput) {
			return {};
		}

		// 명령어인지 확인
		if (!commandRegistry.isCommand(userInput)) {
			// 일반 메시지 → commandResult를 null로 설정
			return {
				commandResult: null,
			};
		}

		// 명령어 파싱
		const parsed = commandRegistry.parseCommand(userInput);
		if (!parsed) {
			return {
				commandResult: {
					type: "error",
					message: "❌ 명령어 파싱 실패",
				} as CommandResult,
			};
		}

		// commandResult에 파싱 정보 저장 (실행은 handleCommand 노드에서)
		return {
			commandResult: {
				type: "parsed",
				commandName: parsed.commandName,
				args: parsed.args,
			} as any, // 임시로 any 사용 (파싱된 상태 표현)
		};
	};
}

/**
 * createHandleCommandNode: 명령어를 실행하는 노드
 *
 * commandResult에서 파싱된 명령어를 가져와 실행합니다.
 *
 * @param commandRegistry - 명령어 레지스트리
 */
export function createHandleCommandNode(commandRegistry: CommandRegistry) {
	// biome-ignore lint/suspicious/noExplicitAny: State type varies by sample
	return async (state: any) => {
		const commandResult = state.commandResult;

		// commandResult가 파싱된 상태인지 확인
		if (
			!commandResult ||
			!("commandName" in commandResult) ||
			!("args" in commandResult)
		) {
			return {
				commandResult: {
					type: "error",
					message: "❌ 잘못된 명령어 상태",
				} as CommandResult,
			};
		}

		// 명령어 실행
		const result = await commandRegistry.execute(
			commandResult.commandName,
			commandResult.args,
			{ ...state }, // state 전체를 context로 전달
		);

		return {
			commandResult: result,
		};
	};
}
