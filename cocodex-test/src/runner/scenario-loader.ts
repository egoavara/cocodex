import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { glob } from "glob";
import type { TestScenario } from "../config/types.js";
import { TEST_CONFIG } from "../config/defaults.js";

/**
 * 시나리오 로더 클래스
 */
export class ScenarioLoader {
  private baseDir: string;

  constructor(baseDir: string = ".") {
    this.baseDir = baseDir;
  }

  /**
   * 단일 시나리오 로드
   */
  async loadScenario(filePath: string): Promise<TestScenario> {
    const content = await fs.readFile(filePath, "utf-8");

    if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
      return parseYaml(content) as TestScenario;
    }

    if (filePath.endsWith(".json")) {
      return JSON.parse(content) as TestScenario;
    }

    throw new Error(`Unsupported scenario format: ${filePath}`);
  }

  /**
   * 모든 시나리오 로드
   */
  async loadAllScenarios(): Promise<TestScenario[]> {
    const scenariosDir = path.join(this.baseDir, TEST_CONFIG.scenariosDir);

    const patterns = [
      path.join(scenariosDir, "*.yaml"),
      path.join(scenariosDir, "*.yml"),
      path.join(scenariosDir, "*.json"),
    ];

    const files = await glob(patterns);
    const scenarios: TestScenario[] = [];

    for (const file of files.sort()) {
      try {
        const scenario = await this.loadScenario(file);
        scenarios.push(scenario);
      } catch (error) {
        console.error(`Failed to load scenario: ${file}`, error);
      }
    }

    return scenarios;
  }

  /**
   * 특정 구현체의 시나리오만 필터링
   */
  async loadScenariosForImplementation(
    implName: string
  ): Promise<TestScenario[]> {
    const all = await this.loadAllScenarios();
    return all.filter((s) => s.implementation === implName);
  }

  /**
   * 이름으로 시나리오 검색
   */
  async findScenarioByName(name: string): Promise<TestScenario | null> {
    const all = await this.loadAllScenarios();
    return all.find((s) => s.name === name) || null;
  }

  /**
   * 시나리오 목록 조회 (메타 정보만)
   */
  async listScenarios(): Promise<
    Array<{
      name: string;
      description: string;
      implementation: string;
      filePath: string;
    }>
  > {
    const scenariosDir = path.join(this.baseDir, TEST_CONFIG.scenariosDir);

    const patterns = [
      path.join(scenariosDir, "*.yaml"),
      path.join(scenariosDir, "*.yml"),
      path.join(scenariosDir, "*.json"),
    ];

    const files = await glob(patterns);
    const results: Array<{
      name: string;
      description: string;
      implementation: string;
      filePath: string;
    }> = [];

    for (const file of files.sort()) {
      try {
        const scenario = await this.loadScenario(file);
        results.push({
          name: scenario.name,
          description: scenario.description,
          implementation: scenario.implementation,
          filePath: file,
        });
      } catch {
        // 로드 실패한 시나리오는 건너뜀
      }
    }

    return results;
  }
}
