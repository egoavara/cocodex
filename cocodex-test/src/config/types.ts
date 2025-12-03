/**
 * 구현체 설정 타입
 */
export interface ImplementationConfig {
  name: string;
  description: string;
  rootDir: string;
  command: {
    type: "npm" | "npx" | "tsx" | "node" | "custom";
    script?: string;
    file?: string;
    args?: string[];
    workingDir: string;
  };
  environment: Record<string, string>;
  prompts: {
    input: string;
    output: string;
    tool?: string;
  };
  paths: {
    sessions: string;
    commands: string;
    context: string;
  };
  timeouts: {
    startup: number;
    response: number;
    toolExecution: number;
  };
}

/**
 * 테스트 스텝 기본 타입
 */
export interface BaseStep {
  type: string;
}

/**
 * 입력 스텝
 */
export interface InputStep extends BaseStep {
  type: "input";
  text: string;
}

/**
 * 대기 스텝
 */
export interface WaitStep extends BaseStep {
  type: "wait";
  condition: "text" | "regex" | "ready" | "tool_call" | "exit" | "silence" | "exit_or_silence" | "turn";
  pattern?: string;
  toolName?: string;
  timeout?: number;
  silenceDuration?: number; // silence/exit_or_silence 조건에서 사용 (기본값: 2000ms)
}

/**
 * 어서션 스텝
 */
export interface AssertStep extends BaseStep {
  type: "assert";
  assertions: Assertion[];
}

/**
 * 지연 스텝
 */
export interface DelayStep extends BaseStep {
  type: "delay";
  ms: number;
}

/**
 * 스텝 유니온 타입
 */
export type ScenarioStep = InputStep | WaitStep | AssertStep | DelayStep;

/**
 * 어서션 타입
 */
export type Assertion =
  | { type: "contains"; text: string }
  | { type: "not_contains"; text: string }
  | { type: "matches"; regex: string }
  | { type: "tool_was_called"; toolName: string }
  | { type: "file_exists"; pattern: string }
  | { type: "file_contains"; path: string; text: string }
  | { type: "session_saved" }
  | { type: "token_count_decreased" };

/**
 * 테스트 시나리오
 */
export interface TestScenario {
  name: string;
  description: string;
  implementation: string;
  setup?: {
    files?: Array<{ path: string; content: string }>;
    directories?: string[];
  };
  steps: ScenarioStep[];
  teardown?: {
    cleanup?: string[];
    verify?: Assertion[];
  };
}

/**
 * 테스트 결과
 */
export interface TestResult {
  scenario: string;
  implementation: string;
  status: "passed" | "failed" | "skipped";
  duration: number;
  steps: StepResult[];
  error?: string;
}

/**
 * 스텝 결과
 */
export interface StepResult {
  index: number;
  type: string;
  status: "passed" | "failed";
  duration: number;
  error?: string;
  output?: string;
}

/**
 * CLI 실행 옵션
 */
export interface RunOptions {
  scenario?: string;
  implementation?: string;
  trace?: boolean;
}
