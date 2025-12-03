import { AnsiParser } from "../utils/ansi-parser.js";

/**
 * 터미널 출력 매칭 유틸리티
 */
export class OutputMatcher {
  private buffer: string = "";

  /**
   * 버퍼에 출력 추가
   */
  append(data: string): void {
    this.buffer += data;
  }

  /**
   * 클린 텍스트 반환 (ANSI 코드 제거)
   */
  getCleanText(): string {
    return AnsiParser.clean(this.buffer);
  }

  /**
   * 원본 버퍼 반환
   */
  getRawBuffer(): string {
    return this.buffer;
  }

  /**
   * 텍스트 포함 여부 확인
   */
  contains(text: string): boolean {
    return this.getCleanText().includes(text);
  }

  /**
   * 정규식 매칭
   */
  matches(pattern: string | RegExp): boolean {
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    return regex.test(this.getCleanText());
  }

  /**
   * 마지막 N줄 추출
   */
  getLastLines(n: number): string[] {
    const lines = this.getCleanText().split("\n");
    return lines.slice(-n);
  }

  /**
   * 특정 패턴 이후의 텍스트 추출
   */
  extractAfter(pattern: string | RegExp): string | null {
    const text = this.getCleanText();
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    const match = text.match(regex);

    if (match && match.index !== undefined) {
      return text.substring(match.index + match[0].length).trim();
    }
    return null;
  }

  /**
   * AI 응답 추출 (프롬프트 기반)
   */
  extractResponse(aiPrompt: string, userPrompt: string): string | null {
    const text = this.getCleanText();
    const aiStart = text.lastIndexOf(aiPrompt);

    if (aiStart === -1) return null;

    const responseStart = aiStart + aiPrompt.length;
    const nextUserPrompt = text.indexOf(userPrompt, responseStart);

    if (nextUserPrompt === -1) {
      return text.substring(responseStart).trim();
    }

    return text.substring(responseStart, nextUserPrompt).trim();
  }

  /**
   * Tool 호출 추출
   */
  extractToolCalls(toolPattern: string = "\\[Tool: (\\w+)\\]"): string[] {
    const text = this.getCleanText();
    const regex = new RegExp(toolPattern, "g");
    const tools: string[] = [];

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      if (match[1]) {
        tools.push(match[1]);
      }
    }

    return tools;
  }

  /**
   * 버퍼 초기화
   */
  clear(): void {
    this.buffer = "";
  }

  /**
   * 버퍼 길이
   */
  get length(): number {
    return this.buffer.length;
  }
}
