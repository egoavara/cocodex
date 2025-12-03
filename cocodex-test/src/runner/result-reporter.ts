import chalk from "chalk";
import type { TestResult, StepResult } from "../config/types.js";

/**
 * 테스트 결과 리포터
 */
export class ResultReporter {
  private results: TestResult[] = [];

  /**
   * 결과 추가
   */
  addResult(result: TestResult): void {
    this.results.push(result);
  }

  /**
   * 콘솔 출력
   */
  printSummary(): void {
    console.log("\n" + chalk.bold("═".repeat(60)));
    console.log(chalk.bold("  Test Results Summary"));
    console.log(chalk.bold("═".repeat(60)) + "\n");

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter((r) => r.status === "failed").length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;

    for (const result of this.results) {
      this.printResult(result);
    }

    console.log("\n" + chalk.bold("─".repeat(60)));
    console.log(
      `  ${chalk.green(`✓ ${passed} passed`)}  ` +
        `${chalk.red(`✗ ${failed} failed`)}  ` +
        `${chalk.yellow(`○ ${skipped} skipped`)}`
    );
    console.log(
      `  Total time: ${this.formatDuration(this.getTotalDuration())}`
    );
    console.log(chalk.bold("─".repeat(60)) + "\n");
  }

  /**
   * 개별 결과 출력
   */
  private printResult(result: TestResult): void {
    const statusIcon = this.getStatusIcon(result.status);
    const statusColor = this.getStatusColor(result.status);

    console.log(
      statusColor(`${statusIcon} ${result.scenario}`) +
        chalk.gray(` [${result.implementation}]`) +
        chalk.gray(` (${this.formatDuration(result.duration)})`)
    );

    if (result.status === "failed" && result.error) {
      console.log(chalk.red(`    Error: ${result.error}`));
    }

    // 실패한 스텝 출력
    const failedSteps = result.steps.filter((s) => s.status === "failed");
    for (const step of failedSteps) {
      console.log(
        chalk.red(`    Step ${step.index + 1} (${step.type}): ${step.error}`)
      );
    }
  }

  /**
   * 상태 아이콘
   */
  private getStatusIcon(status: TestResult["status"]): string {
    switch (status) {
      case "passed":
        return "✓";
      case "failed":
        return "✗";
      case "skipped":
        return "○";
    }
  }

  /**
   * 상태별 색상
   */
  private getStatusColor(
    status: TestResult["status"]
  ): (text: string) => string {
    switch (status) {
      case "passed":
        return chalk.green;
      case "failed":
        return chalk.red;
      case "skipped":
        return chalk.yellow;
    }
  }

  /**
   * 시간 포맷팅
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    return `${(ms / 1000).toFixed(2)}s`;
  }

  /**
   * 총 소요 시간
   */
  private getTotalDuration(): number {
    return this.results.reduce((sum, r) => sum + r.duration, 0);
  }

  /**
   * JSON 출력
   */
  toJSON(): object {
    return {
      summary: {
        total: this.results.length,
        passed: this.results.filter((r) => r.status === "passed").length,
        failed: this.results.filter((r) => r.status === "failed").length,
        skipped: this.results.filter((r) => r.status === "skipped").length,
        duration: this.getTotalDuration(),
      },
      results: this.results,
    };
  }

  /**
   * 결과 초기화
   */
  clear(): void {
    this.results = [];
  }

  /**
   * 실패 여부
   */
  hasFailures(): boolean {
    return this.results.some((r) => r.status === "failed");
  }
}
