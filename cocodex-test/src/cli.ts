#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import path from "node:path";
import { ScenarioLoader } from "./runner/scenario-loader.js";
import { ConfigLoader } from "./config/loader.js";
import { TestRunner } from "./runner/test-runner.js";
import { ResultReporter } from "./runner/result-reporter.js";

const baseDir = process.cwd();

program
  .name("cocodex-test")
  .description("COCODEX TUI Testing Framework (node-pty based)")
  .version("1.0.0");

// 시나리오 목록 조회
program
  .command("list")
  .description("List all available test scenarios")
  .option("-i, --implementation <name>", "Filter by implementation")
  .action(async (options) => {
    const loader = new ScenarioLoader(baseDir);

    try {
      const scenarios = await loader.listScenarios();
      const filtered = options.implementation
        ? scenarios.filter((s) => s.implementation === options.implementation)
        : scenarios;

      console.log(chalk.bold("\n  Available Test Scenarios\n"));
      console.log(chalk.gray("  " + "─".repeat(56)));

      if (filtered.length === 0) {
        console.log(chalk.yellow("  No scenarios found.\n"));
        return;
      }

      for (const scenario of filtered) {
        console.log(chalk.cyan(`  ${scenario.name}`));
        console.log(
          chalk.gray(`    Implementation: ${scenario.implementation}`)
        );
        console.log(chalk.gray(`    ${scenario.description}`));
        console.log();
      }

      console.log(chalk.gray(`  Total: ${filtered.length} scenarios\n`));
    } catch (error) {
      console.error(chalk.red("Error loading scenarios:"), error);
      process.exit(1);
    }
  });

// 구현체 목록 조회
program
  .command("implementations")
  .description("List all available implementations")
  .action(async () => {
    const loader = new ConfigLoader(baseDir);

    try {
      const implementations = await loader.listImplementations();

      console.log(chalk.bold("\n  Available Implementations\n"));
      console.log(chalk.gray("  " + "─".repeat(56)));

      if (implementations.length === 0) {
        console.log(chalk.yellow("  No implementations found.\n"));
        return;
      }

      for (const impl of implementations) {
        try {
          const config = await loader.loadImplementation(impl);
          console.log(chalk.cyan(`  ${impl}`));
          console.log(chalk.gray(`    ${config.description}`));
          console.log(chalk.gray(`    Root: ${config.rootDir}`));
          console.log();
        } catch {
          console.log(chalk.yellow(`  ${impl} (config error)`));
          console.log();
        }
      }

      console.log(
        chalk.gray(`  Total: ${implementations.length} implementations\n`)
      );
    } catch (error) {
      console.error(chalk.red("Error loading implementations:"), error);
      process.exit(1);
    }
  });

// 테스트 실행
program
  .command("run")
  .description("Run test scenarios")
  .option("-s, --scenario <name>", "Run specific scenario")
  .option(
    "-i, --implementation <name>",
    "Run tests for specific implementation",
    "langgraph"
  )
  .action(async (options) => {
    console.log(chalk.bold("\n  COCODEX TUI Test Runner (node-pty)\n"));
    console.log(chalk.gray("  " + "─".repeat(56)));
    console.log(chalk.gray(`  Implementation: ${options.implementation}`));

    if (options.scenario) {
      console.log(chalk.gray(`  Scenario: ${options.scenario}`));
    }

    console.log(chalk.gray("  " + "─".repeat(56)) + "\n");

    const runner = new TestRunner(baseDir);
    const scenarioLoader = new ScenarioLoader(baseDir);
    const configLoader = new ConfigLoader(baseDir);
    const reporter = new ResultReporter();

    try {
      // 구현체 설정 로드
      const config = await configLoader.loadImplementation(
        options.implementation
      );
      console.log(chalk.gray(`  Loading implementation: ${config.name}\n`));

      // 시나리오 로드
      let scenarios = await scenarioLoader.loadScenariosForImplementation(
        options.implementation
      );

      if (options.scenario) {
        scenarios = scenarios.filter((s) =>
          s.name.toLowerCase().includes(options.scenario.toLowerCase())
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
  });

// 시나리오 검증
program
  .command("validate")
  .description("Validate scenario files")
  .action(async () => {
    const scenarioLoader = new ScenarioLoader(baseDir);
    const configLoader = new ConfigLoader(baseDir);

    console.log(chalk.bold("\n  Validating Scenarios\n"));
    console.log(chalk.gray("  " + "─".repeat(56)));

    let valid = 0;
    let invalid = 0;

    try {
      const scenarios = await scenarioLoader.loadAllScenarios();

      for (const scenario of scenarios) {
        try {
          // 구현체 설정 확인
          await configLoader.loadImplementation(scenario.implementation);
          console.log(chalk.green(`  ✓ ${scenario.name}`));
          valid++;
        } catch (error) {
          console.log(chalk.red(`  ✗ ${scenario.name}`));
          console.log(
            chalk.red(
              `    Error: ${error instanceof Error ? error.message : error}`
            )
          );
          invalid++;
        }
      }

      console.log(chalk.gray("\n  " + "─".repeat(56)));
      console.log(
        chalk.green(`  ✓ ${valid} valid`) +
          (invalid > 0 ? chalk.red(` | ✗ ${invalid} invalid`) : "")
      );
      console.log();

      if (invalid > 0) {
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("  Validation failed:"), error);
      process.exit(1);
    }
  });

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

program.parse();
