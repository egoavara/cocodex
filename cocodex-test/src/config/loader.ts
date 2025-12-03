import { promises as fs } from "node:fs";
import path from "node:path";
import type { ImplementationConfig } from "./types.js";
import { createDefaultConfig, TEST_CONFIG } from "./defaults.js";

/**
 * 설정 로더 클래스
 */
export class ConfigLoader {
  private baseDir: string;

  constructor(baseDir: string = ".") {
    this.baseDir = baseDir;
  }

  /**
   * 구현체 설정 로드
   */
  async loadImplementation(name: string): Promise<ImplementationConfig> {
    const configPath = path.join(
      this.baseDir,
      TEST_CONFIG.implementationsDir,
      `${name}.json`
    );

    try {
      const content = await fs.readFile(configPath, "utf-8");
      const rawConfig = JSON.parse(content);

      // 환경 변수 치환
      const config = this.substituteEnvVars(rawConfig);

      return createDefaultConfig(config);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Implementation config not found: ${name}`);
      }
      throw error;
    }
  }

  /**
   * 사용 가능한 구현체 목록 조회
   */
  async listImplementations(): Promise<string[]> {
    const implDir = path.join(this.baseDir, TEST_CONFIG.implementationsDir);

    try {
      const files = await fs.readdir(implDir);
      return files
        .filter((f) => f.endsWith(".json"))
        .map((f) => path.basename(f, ".json"));
    } catch {
      return [];
    }
  }

  /**
   * 환경 변수 치환
   */
  private substituteEnvVars<T>(obj: T): T {
    if (typeof obj === "string") {
      // ${ENV_VAR} 패턴 치환
      return obj.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
        return process.env[envVar] || "";
      }) as T;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.substituteEnvVars(item)) as T;
    }

    if (obj && typeof obj === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.substituteEnvVars(value);
      }
      return result as T;
    }

    return obj;
  }
}
