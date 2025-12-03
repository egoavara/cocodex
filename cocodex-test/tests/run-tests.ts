#!/usr/bin/env tsx
/**
 * COCODEX TUI 테스트 실행기
 * node-pty 기반으로 YAML 시나리오를 실행
 */
import path from "node:path";
import chalk from "chalk";
import { TestRunner } from "../src/runner/test-runner.js";
import { ScenarioLoader } from "../src/runner/scenario-loader.js";
import { ResultReporter } from "../src/runner/result-reporter.js";
import { ConfigLoader } from "../src/config/loader.js";

const baseDir = path.resolve(import.meta.dirname, "..");

// CLI 인자 파싱
const args = process.argv.slice(2);
const targetImplementation =
  args.find((a) => a.startsWith("--implementation="))?.split("=")[1] ||
  process.env.COCODEX_TEST_IMPLEMENTATION ||
  "typescript-langgraph";
const targetScenario =
  args.find((a) => a.startsWith("--scenario="))?.split("=")[1] ||
  process.env.COCODEX_TEST_SCENARIO;
const debugMode = args.includes("--debug");

async function main() {
  console.log(chalk.bold("\n  COCODEX TUI Test Runner\n"));
  console.log(chalk.gray("  " + "─".repeat(56)));
  console.log(chalk.gray(`  Implementation: ${targetImplementation}`));
  if (targetScenario) {
    console.log(chalk.gray(`  Scenario: ${targetScenario}`));
  }
  if (debugMode) {
    console.log(chalk.yellow(`  Debug: enabled`));
  }
  console.log(chalk.gray("  " + "─".repeat(56)) + "\n");

  const runner = new TestRunner(baseDir, { debug: debugMode });
  const scenarioLoader = new ScenarioLoader(baseDir);
  const configLoader = new ConfigLoader(baseDir);
  const reporter = new ResultReporter();

  try {
    // 구현체 설정 로드
    const config = await configLoader.loadImplementation(targetImplementation);
    console.log(chalk.gray(`  Loading implementation: ${config.name}\n`));

    // 시나리오 로드
    let scenarios = await scenarioLoader.loadScenariosForImplementation(
      targetImplementation
    );

    if (targetScenario) {
      scenarios = scenarios.filter((s) =>
        s.name.toLowerCase().includes(targetScenario.toLowerCase())
      );
    }

    if (scenarios.length === 0) {
      console.log(chalk.yellow("  No scenarios found to run.\n"));
      process.exit(0);
    }

    console.log(chalk.gray(`  Found ${scenarios.length} scenario(s)\n`));

    // 각 시나리오 실행
    for (const scenario of scenarios) {
      console.log(chalk.cyan(`  Running: ${scenario.name}`));
      console.log(chalk.gray(`    ${scenario.description || ""}`));

      const result = await runner.runScenario(scenario, config);
      reporter.addResult(result);

      if (result.status === "passed") {
        console.log(
          chalk.green(`    ✓ Passed`) +
            chalk.gray(` (${formatDuration(result.duration)})`)
        );
      } else {
        console.log(
          chalk.red(`    ✗ Failed`) +
            chalk.gray(` (${formatDuration(result.duration)})`)
        );
        if (result.error) {
          console.log(chalk.red(`      Error: ${result.error}`));
        }
      }
      console.log();
    }

    // 결과 요약
    reporter.printSummary();

    // 실패가 있으면 exit code 1
    if (reporter.hasFailures()) {
      process.exit(1);
    }
  } catch (error) {
    console.error(chalk.red("\n  Error running tests:"), error);
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

main();
