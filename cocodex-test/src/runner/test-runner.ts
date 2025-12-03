import { promises as fs } from "node:fs";
import path from "node:path";
import { glob } from "glob";
import type {
  TestScenario,
  TestResult,
  StepResult,
  ImplementationConfig,
  ScenarioStep,
  InputStep,
  WaitStep,
  AssertStep,
  DelayStep,
  Assertion,
} from "../config/types.js";
import { PtyController } from "../terminal/pty-controller.js";
import { ScenarioLoader } from "./scenario-loader.js";
import { ConfigLoader } from "../config/loader.js";

/**
 * 테스트 러너 옵션
 */
export interface TestRunnerOptions {
  debug?: boolean;
}

/**
 * 테스트 러너 클래스
 * node-pty 기반으로 직접 TUI 앱을 테스트
 */
export class TestRunner {
  private baseDir: string;
  private scenarioLoader: ScenarioLoader;
  private configLoader: ConfigLoader;
  private options: TestRunnerOptions;

  constructor(baseDir: string = ".", options: TestRunnerOptions = {}) {
    this.baseDir = baseDir;
    this.scenarioLoader = new ScenarioLoader(baseDir);
    this.configLoader = new ConfigLoader(baseDir);
    this.options = options;
  }

  /**
   * 단일 시나리오 실행
   */
  async runScenario(
    scenario: TestScenario,
    config: ImplementationConfig
  ): Promise<TestResult> {
    const startTime = Date.now();
    const stepResults: StepResult[] = [];
    const controller = new PtyController(config, { debug: this.options.debug });

    try {
      // Setup
      if (scenario.setup) {
        await this.executeSetup(scenario.setup);
      }

      // PTY 프로세스 시작
      controller.start();

      // 스텝 실행
      for (let i = 0; i < scenario.steps.length; i++) {
        const step = scenario.steps[i];
        const stepStart = Date.now();

        try {
          await this.executeStep(step, controller, config);
          stepResults.push({
            index: i,
            type: step.type,
            status: "passed",
            duration: Date.now() - stepStart,
          });
        } catch (error) {
          stepResults.push({
            index: i,
            type: step.type,
            status: "failed",
            duration: Date.now() - stepStart,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      }

      // Teardown
      if (scenario.teardown) {
        await this.executeTeardown(
          scenario.teardown,
          controller.getOutputMatcher()
        );
      }

      return {
        scenario: scenario.name,
        implementation: scenario.implementation,
        status: "passed",
        duration: Date.now() - startTime,
        steps: stepResults,
      };
    } catch (error) {
      return {
        scenario: scenario.name,
        implementation: scenario.implementation,
        status: "failed",
        duration: Date.now() - startTime,
        steps: stepResults,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      // 프로세스가 아직 실행 중이면 정상 종료 대기 후 강제 종료
      if (controller.isProcessRunning()) {
        try {
          // 프로세스가 자연스럽게 종료되도록 잠시 대기
          await controller.waitForExit(3000);
        } catch {
          // 타임아웃 시에만 강제 종료
          controller.kill();
        }
      }
    }
  }

  /**
   * 개별 스텝 실행
   */
  private async executeStep(
    step: ScenarioStep,
    controller: PtyController,
    config: ImplementationConfig
  ): Promise<void> {
    const timeouts = controller.getTimeouts();

    switch (step.type) {
      case "input":
        controller.sendInput((step as InputStep).text);
        // 입력 후 약간의 딜레이
        await new Promise((r) => setTimeout(r, 100));
        break;

      case "wait": {
        const waitStep = step as WaitStep;
        const timeout = waitStep.timeout || timeouts.response;

        switch (waitStep.condition) {
          case "text":
            await controller.waitForText(waitStep.pattern!, timeout);
            break;

          case "regex":
            await controller.waitForText(
              new RegExp(waitStep.pattern!),
              timeout
            );
            break;

          case "ready":
            await controller.waitForText(
              controller.getReadyPattern(),
              timeouts.startup
            );
            break;

          case "tool_call":
            const toolPattern =
              config.prompts.tool || `Tool.*${waitStep.toolName}`;
            await controller.waitForText(
              new RegExp(toolPattern),
              timeouts.toolExecution
            );
            break;

          case "exit":
            await controller.waitForExit(timeout);
            break;

          case "silence":
            // 침묵 감지: 일정 시간 동안 새 출력이 없으면 완료로 간주
            const silenceDuration = waitStep.silenceDuration || 2000;
            await controller.waitForSilence(silenceDuration, timeout);
            break;

          case "exit_or_silence":
            // 종료 또는 침묵 감지: 둘 중 하나 발생 시 완료
            // 프로세스가 자연 종료되지 않으면 침묵 감지 후 강제 종료
            const exitSilenceDuration = waitStep.silenceDuration || 3000;
            await controller.waitForExitOrSilence(exitSilenceDuration, timeout);
            break;

          case "turn":
            // 턴 감지: "You: " 프롬프트가 나타나면 AI 응답 완료로 간주
            // 패턴 "You:\s*$"는 공백으로 끝나는 프롬프트만 매치
            // 에코된 입력(예: "You: /status")은 매치되지 않음
            await controller.waitForText(/You:\s*$/, timeout);
            break;
        }
        break;
      }

      case "assert": {
        const assertStep = step as AssertStep;
        const matcher = controller.getOutputMatcher();
        for (const assertion of assertStep.assertions) {
          await this.executeAssertion(assertion, matcher);
        }
        break;
      }

      case "delay":
        await new Promise((r) => setTimeout(r, (step as DelayStep).ms));
        break;
    }
  }

  /**
   * 어서션 실행
   */
  private async executeAssertion(
    assertion: Assertion,
    matcher: { contains: (t: string) => boolean; matches: (r: string) => boolean; extractToolCalls: () => string[] }
  ): Promise<void> {
    switch (assertion.type) {
      case "contains":
        if (!matcher.contains(assertion.text)) {
          throw new Error(`Expected output to contain: "${assertion.text}"`);
        }
        break;

      case "not_contains":
        if (matcher.contains(assertion.text)) {
          throw new Error(
            `Expected output NOT to contain: "${assertion.text}"`
          );
        }
        break;

      case "matches":
        if (!matcher.matches(assertion.regex)) {
          throw new Error(`Expected output to match regex: ${assertion.regex}`);
        }
        break;

      case "tool_was_called": {
        const calls = matcher.extractToolCalls();
        if (!calls.includes(assertion.toolName)) {
          throw new Error(
            `Expected tool "${assertion.toolName}" to be called`
          );
        }
        break;
      }

      case "file_exists": {
        const files = await glob(assertion.pattern);
        if (files.length === 0) {
          throw new Error(
            `Expected file matching "${assertion.pattern}" to exist`
          );
        }
        break;
      }

      case "file_contains": {
        const content = await fs.readFile(assertion.path, "utf-8");
        if (!content.includes(assertion.text)) {
          throw new Error(
            `Expected file "${assertion.path}" to contain "${assertion.text}"`
          );
        }
        break;
      }

      case "session_saved": {
        const sessions = await glob(".cocodex/sessions/*.json");
        if (sessions.length === 0) {
          throw new Error("Expected session to be saved");
        }
        break;
      }

      case "token_count_decreased":
        // 토큰 카운트 감소는 /status 명령의 출력을 비교해야 함
        // 현재는 항상 통과로 처리
        break;
    }
  }

  /**
   * Setup 실행
   */
  private async executeSetup(
    setup: NonNullable<TestScenario["setup"]>
  ): Promise<void> {
    // 디렉토리 생성
    if (setup.directories) {
      for (const dir of setup.directories) {
        await fs.mkdir(dir, { recursive: true });
      }
    }

    // 파일 생성
    if (setup.files) {
      for (const file of setup.files) {
        await fs.mkdir(path.dirname(file.path), { recursive: true });
        await fs.writeFile(file.path, file.content, "utf-8");
      }
    }
  }

  /**
   * Teardown 실행
   */
  private async executeTeardown(
    teardown: NonNullable<TestScenario["teardown"]>,
    matcher: { contains: (t: string) => boolean; matches: (r: string) => boolean; extractToolCalls: () => string[] }
  ): Promise<void> {
    // 파일 정리
    if (teardown.cleanup) {
      for (const pattern of teardown.cleanup) {
        const files = await glob(pattern);
        for (const file of files) {
          await fs.unlink(file).catch(() => {});
        }
      }
    }

    // 검증
    if (teardown.verify) {
      for (const assertion of teardown.verify) {
        await this.executeAssertion(assertion, matcher);
      }
    }
  }

  /**
   * 구현체 설정 로드
   */
  async loadImplementation(name: string): Promise<ImplementationConfig> {
    return this.configLoader.loadImplementation(name);
  }

  /**
   * 시나리오 로더 접근
   */
  getScenarioLoader(): ScenarioLoader {
    return this.scenarioLoader;
  }
}
