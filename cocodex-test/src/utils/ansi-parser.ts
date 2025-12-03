import stripAnsi from "strip-ansi";

/**
 * ANSI 이스케이프 코드 처리 유틸리티
 */
export class AnsiParser {
  /**
   * ANSI 코드 제거
   */
  static strip(text: string): string {
    return stripAnsi(text);
  }

  /**
   * 컬러 코드만 제거 (커서 이동 등은 유지)
   */
  static stripColors(text: string): string {
    // SGR (Select Graphic Rendition) 코드만 제거
    return text.replace(/\x1b\[[0-9;]*m/g, "");
  }

  /**
   * 커서 이동 코드 제거
   */
  static stripCursor(text: string): string {
    return text
      .replace(/\x1b\[[0-9]*[ABCDEFGJKST]/g, "") // 커서 이동
      .replace(/\x1b\[[0-9;]*[Hf]/g, "") // 커서 위치 지정
      .replace(/\x1b\[?[0-9]*[su]/g, ""); // 커서 저장/복원
  }

  /**
   * 개행 정규화
   */
  static normalizeNewlines(text: string): string {
    return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  /**
   * 전체 정리 (ANSI 제거 + 개행 정규화)
   */
  static clean(text: string): string {
    return this.normalizeNewlines(this.strip(text));
  }
}
