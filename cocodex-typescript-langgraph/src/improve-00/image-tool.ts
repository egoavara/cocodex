/**
 * Image Tool for Improve-00
 *
 * read_image Tool을 정의합니다.
 * AI가 이미지 파일을 읽고 분석할 수 있도록 base64 인코딩을 제공합니다.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolExecutor, ToolSchema } from "../sample-01/tools.js";

// ========== read_image Tool 스키마 ==========

export const imageToolSchema: ToolSchema = {
	type: "function",
	function: {
		name: "read_image",
		description:
			"이미지 파일(PNG, JPG, JPEG, GIF, WEBP)을 읽어서 내용을 분석합니다. 사용자가 이미지 파일 분석을 요청하면 이 도구를 사용하세요.",
		parameters: {
			type: "object",
			properties: {
				path: {
					type: "string",
					description: "읽을 이미지 파일의 경로 (예: ./image.png, test.jpg)",
				},
			},
			required: ["path"],
		},
	},
};

// ========== read_image Tool 실행 함수 ==========

export const imageToolExecutor: ToolExecutor = async (args) => {
	// 1. 이미지 파일 읽기
	const imageBuffer = await fs.readFile(args.path);

	// 2. Base64 인코딩
	const base64Image = imageBuffer.toString("base64");

	// 3. MIME 타입 감지
	const ext = path.extname(args.path).toLowerCase();
	const mimeTypes: Record<string, string> = {
		".png": "image/png",
		".jpg": "image/jpeg",
		".jpeg": "image/jpeg",
		".gif": "image/gif",
		".webp": "image/webp",
	};
	const mimeType = mimeTypes[ext] || "image/jpeg";

	// 4. 로그 출력
	const sizeKB = Math.round(base64Image.length / 1024);
	console.log(`    ✅ [Result] 이미지 읽기 성공 (${sizeKB}KB)`);

	// 5. Data URL 형식으로 반환 (OpenAI Vision API 형식)
	return `data:${mimeType};base64,${base64Image}`;
};
