/**
 * 공통 Context Manager 시스템
 *
 * cocoagent.md 파일을 재귀적으로 탐색하여 프로젝트 컨텍스트 로드
 *
 * 핵심 기능:
 * - 부모 폴더 재귀 탐색
 * - 계층적 컨텍스트 구성 (부모 → 현재)
 * - 첫 번째 User 메시지 생성
 */

import { promises as fs } from "node:fs";
import path from "node:path";

// ========== ContextFile ==========

export interface ContextFile {
	path: string;
	content: string;
	level: number; // 0: 최상위 부모, 1: 중간, 2: 현재
}

// ========== ContextManager ==========

export class ContextManager {
	private startDir: string;

	constructor(startDir: string = process.cwd()) {
		this.startDir = startDir;
	}

	// 재귀적으로 부모 폴더를 순회하며 cocoagent.md 찾기
	async findCocoagentFiles(): Promise<ContextFile[]> {
		const contexts: ContextFile[] = [];
		let currentDir = this.startDir;

		console.log("\n📂 cocoagent.md 파일 탐색 중...");

		// 부모 폴더로 올라가며 cocoagent.md 찾기 (최대 10단계)
		for (let i = 0; i < 10; i++) {
			const cocoagentPath = path.join(currentDir, "cocoagent.md");

			try {
				await fs.access(cocoagentPath);
				const content = await fs.readFile(cocoagentPath, "utf-8");
				contexts.unshift({
					// 부모 → 현재 순서로 추가하기 위해 unshift
					path: cocoagentPath,
					content,
					level: i,
				});
				console.log(`  ✅ 발견: ${cocoagentPath} (${content.length}자)`);
			} catch {
				// 파일이 없으면 무시
			}

			// 부모 디렉토리로 이동
			const parentDir = path.dirname(currentDir);
			if (parentDir === currentDir) {
				// 루트 디렉토리 도달
				break;
			}
			currentDir = parentDir;
		}

		return contexts;
	}

	// 모든 컨텍스트 로드하여 첫 번째 User 메시지 생성
	async buildInitialUserMessage(): Promise<string> {
		const contexts = await this.findCocoagentFiles();

		if (contexts.length === 0) {
			console.log("  ⚠️  cocoagent.md 파일을 찾을 수 없습니다.");
			return "프로젝트 컨텍스트 파일을 찾을 수 없습니다.";
		}

		console.log(`\n✅ 총 ${contexts.length}개의 cocoagent.md 발견\n`);

		let message =
			"다음은 이 프로젝트에 대한 컨텍스트 정보입니다. 이 정보를 기반으로 사용자를 도와주세요.\n\n";

		// 부모 → 현재 순서로 추가
		for (const context of contexts) {
			const levelName =
				context.level === 0 ? "프로젝트 루트" : `상위 ${context.level}단계`;

			message += `${"=".repeat(60)}\n`;
			message += `[COCOAGENT - ${levelName}]\n`;
			message += `파일 위치: ${context.path}\n`;
			message += `${"=".repeat(60)}\n\n`;
			message += context.content;
			message += `\n\n`;
		}

		message += `${"=".repeat(60)}\n`;
		message +=
			"위 컨텍스트를 참고하여 프로젝트 규칙과 가이드라인을 준수하면서 사용자를 도와주세요.";

		return message;
	}

	// 컨텍스트 파일 목록만 반환
	async getContextFiles(): Promise<ContextFile[]> {
		return this.findCocoagentFiles();
	}

	// 특정 레벨의 컨텍스트만 가져오기
	async getContextByLevel(level: number): Promise<ContextFile | null> {
		const contexts = await this.findCocoagentFiles();
		return contexts.find((ctx) => ctx.level === level) || null;
	}
}
