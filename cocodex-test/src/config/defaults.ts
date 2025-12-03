import type { ImplementationConfig } from "./types.js";

/**
 * 기본 타임아웃 설정
 */
export const DEFAULT_TIMEOUTS = {
  startup: 15000,
  response: 60000,
  toolExecution: 30000,
} as const;

/**
 * 기본 프롬프트 설정
 */
export const DEFAULT_PROMPTS = {
  input: "You: ",
  output: "AI:",
  tool: "[Tool]",
} as const;

/**
 * 기본 경로 설정
 */
export const DEFAULT_PATHS = {
  sessions: ".cocodex/sessions",
  commands: ".cocodex/commands",
  context: "cocoagent.md",
} as const;

/**
 * 기본 구현체 설정 생성
 */
export function createDefaultConfig(
  partial: Partial<ImplementationConfig>
): ImplementationConfig {
  return {
    name: partial.name || "unknown",
    description: partial.description || "",
    rootDir: partial.rootDir || ".",
    command: {
      type: partial.command?.type || "npm",
      script: partial.command?.script,
      file: partial.command?.file,
      args: partial.command?.args,
      workingDir: partial.command?.workingDir || ".",
    },
    environment: partial.environment || {},
    prompts: {
      ...DEFAULT_PROMPTS,
      ...partial.prompts,
    },
    paths: {
      ...DEFAULT_PATHS,
      ...partial.paths,
    },
    timeouts: {
      ...DEFAULT_TIMEOUTS,
      ...partial.timeouts,
    },
  };
}

/**
 * 테스트 설정
 */
export const TEST_CONFIG = {
  scenariosDir: "scenarios",
  implementationsDir: "implementations",
  fixturesDir: "fixtures",
  testsDir: "tests",
  outputDir: "test-results",
} as const;
