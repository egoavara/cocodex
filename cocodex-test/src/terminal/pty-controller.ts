import * as pty from "node-pty";
import type { IPty } from "node-pty";
import type { ImplementationConfig } from "../config/types.js";
import { OutputMatcher } from "./output-matcher.js";

/**
 * 프로그램 실행 설정 타입
 */
export interface ProgramConfig {
  file: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * PtyController 옵션
 */
export interface PtyControllerOptions {
  debug?: boolean;
}

/**
 * 타임스탬프 로그 헬퍼 (debug 모드일 때만 출력)
 */
function createLogger(debug: boolean) {
  return (message: string): void => {
    if (!debug) return;
    const now = new Date();
    const timestamp = now.toISOString().split("T")[1].slice(0, -1); // HH:MM:SS.mmm
    console.log(`[PTY ${timestamp}] ${message}`);
  };
}

/**
 * PTY 제어기 클래스
 * node-pty를 직접 사용하여 터미널 제어
 */
export class PtyController {
  private config: ImplementationConfig;
  private ptyProcess: IPty | null = null;
  private outputMatcher: OutputMatcher;
  private isRunning: boolean = false;
  private exitPromise: Promise<void> | null = null;
  private exitResolve: (() => void) | null = null;
  private lastInput: string = "";
  private lastOutputTime: number = 0;
  private log: (message: string) => void;

  constructor(config: ImplementationConfig, options: PtyControllerOptions = {}) {
    this.config = config;
    this.outputMatcher = new OutputMatcher();
    this.log = createLogger(options.debug ?? false);
  }

  /**
   * 프로그램 실행 설정 생성
   */
  getProgramConfig(): ProgramConfig {
    const { command, environment } = this.config;

    let programConfig: ProgramConfig;

    switch (command.type) {
      case "npm":
        programConfig = {
          file: "npm",
          args: ["run", command.script!],
          cwd: command.workingDir,
        };
        break;

      case "npx":
        programConfig = {
          file: "npx",
          args: ["--yes", ...(command.args || [])],
          cwd: command.workingDir,
        };
        break;

      case "tsx":
        programConfig = {
          file: "npx",
          args: ["--yes", "tsx", command.file!, ...(command.args || [])],
          cwd: command.workingDir,
        };
        break;

      case "node":
        programConfig = {
          file: "node",
          args: [command.file!, ...(command.args || [])],
          cwd: command.workingDir,
        };
        break;

      case "custom":
      default:
        programConfig = {
          file: command.file!,
          args: command.args || [],
          cwd: command.workingDir,
        };
        break;
    }

    // 환경 변수 병합
    programConfig.env = {
      ...process.env,
      ...environment,
    } as Record<string, string>;

    return programConfig;
  }

  /**
   * PTY 프로세스 시작
   */
  start(): void {
    if (this.ptyProcess) {
      throw new Error("PTY process already running");
    }

    const config = this.getProgramConfig();

    // 종료 이벤트를 위한 Promise 설정
    this.exitPromise = new Promise<void>((resolve) => {
      this.exitResolve = resolve;
    });

    this.log(`Spawning: ${config.file} ${(config.args || []).join(" ")}`);
    this.log(`CWD: ${config.cwd}`);

    this.ptyProcess = pty.spawn(config.file, config.args || [], {
      name: "xterm-256color",
      cols: 120,
      rows: 30,
      cwd: config.cwd,
      env: config.env,
    });

    this.log(`Process started with PID: ${this.ptyProcess.pid}`);
    this.isRunning = true;

    // 출력 수집
    this.ptyProcess.onData((data) => {
      this.outputMatcher.append(data);
      this.lastOutputTime = Date.now();
    });

    this.ptyProcess.onExit(({ exitCode, signal }) => {
      this.log(`Process exited with code=${exitCode}, signal=${signal}`);
      this.isRunning = false;
      if (this.exitResolve) {
        this.exitResolve();
        this.exitResolve = null;
      }
    });
  }

  /**
   * 입력 전송 (Enter 포함)
   */
  sendInput(text: string): void {
    if (!this.ptyProcess) {
      throw new Error("PTY process not running");
    }
    this.log(`Sending input: "${text}"`);
    this.lastInput = text;
    this.ptyProcess.write(text + "\r");
  }

  /**
   * 마지막 입력 텍스트 반환
   */
  getLastInput(): string {
    return this.lastInput;
  }

  /**
   * 특정 패턴이 출력에 나타날 때까지 대기
   */
  async waitForText(
    pattern: string | RegExp,
    timeout: number = 30000
  ): Promise<boolean> {
    this.log(`waitForText called, pattern=${pattern}, timeout=${timeout}ms`);
    const startTime = Date.now();
    const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.outputMatcher.matches(regex)) {
          clearInterval(checkInterval);
          this.log(`Pattern matched: ${pattern}`);
          resolve(true);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(
            new Error(
              `Timeout waiting for pattern: ${pattern}\nOutput so far:\n${this.outputMatcher.getCleanText().slice(-500)}`
            )
          );
          return;
        }

        if (!this.isRunning) {
          clearInterval(checkInterval);
          reject(new Error("PTY process exited before pattern matched"));
          return;
        }
      }, 100);
    });
  }

  /**
   * 출력이 멈출 때까지 대기 (침묵 감지)
   * @param silenceDuration 침묵으로 간주할 시간 (ms)
   * @param timeout 전체 타임아웃 (ms)
   */
  async waitForSilence(
    silenceDuration: number = 2000,
    timeout: number = 60000
  ): Promise<void> {
    this.log(`waitForSilence called, silenceDuration=${silenceDuration}ms, timeout=${timeout}ms`);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const timeSinceLastOutput = Date.now() - this.lastOutputTime;

        if (timeSinceLastOutput >= silenceDuration) {
          clearInterval(checkInterval);
          this.log(`Silence detected: ${timeSinceLastOutput}ms since last output`);
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for silence (output still arriving)`));
          return;
        }

        if (!this.isRunning) {
          clearInterval(checkInterval);
          this.log("Process exited while waiting for silence");
          resolve();
          return;
        }
      }, 200);
    });
  }

  /**
   * 프로세스 종료 또는 침묵 대기 (둘 중 하나 발생 시 완료)
   * 침묵이 감지되면 프로세스를 강제 종료
   */
  async waitForExitOrSilence(
    silenceDuration: number = 3000,
    timeout: number = 30000
  ): Promise<void> {
    this.log(`waitForExitOrSilence called, silenceDuration=${silenceDuration}ms, timeout=${timeout}ms`);
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        // 프로세스가 종료되었는지 확인
        if (!this.isProcessAlive()) {
          clearInterval(checkInterval);
          this.isRunning = false;
          this.log("Process exited naturally");
          resolve();
          return;
        }

        // 침묵 감지
        const timeSinceLastOutput = Date.now() - this.lastOutputTime;
        if (timeSinceLastOutput >= silenceDuration) {
          clearInterval(checkInterval);
          this.log(`Silence detected (${timeSinceLastOutput}ms), killing process`);
          this.kill();
          resolve();
          return;
        }

        // 타임아웃
        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          this.log("Timeout reached, killing process");
          this.kill();
          reject(new Error("Timeout waiting for exit or silence"));
          return;
        }
      }, 200);
    });
  }

  /**
   * 프로세스가 실제로 실행 중인지 PID로 확인
   */
  private isProcessAlive(): boolean {
    if (!this.ptyProcess) return false;
    try {
      // kill(pid, 0)은 프로세스 존재 여부만 확인 (실제 시그널 전송 안함)
      process.kill(this.ptyProcess.pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 프로세스 종료 대기
   */
  async waitForExit(timeout: number = 10000): Promise<void> {
    this.log(`waitForExit called, isRunning=${this.isRunning}, timeout=${timeout}ms`);

    if (!this.isRunning) {
      this.log("Process already exited");
      return;
    }

    const startTime = Date.now();

    // 폴링으로 프로세스 종료 확인 (onExit 이벤트가 안 올 수 있음)
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const alive = this.isProcessAlive();
        this.log(`Checking process alive: ${alive}`);

        if (!alive) {
          clearInterval(checkInterval);
          this.isRunning = false;
          this.log("Process exited (detected via PID check)");
          resolve();
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(checkInterval);
          this.log("Timeout reached, process still running");
          reject(new Error("Timeout waiting for process exit"));
          return;
        }
      }, 500);
    });
  }

  /**
   * PTY 프로세스 종료
   */
  kill(): void {
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
      this.isRunning = false;
      if (this.exitResolve) {
        this.exitResolve();
        this.exitResolve = null;
      }
    }
  }

  /**
   * 출력 매처 반환
   */
  getOutputMatcher(): OutputMatcher {
    return this.outputMatcher;
  }

  /**
   * 출력 버퍼 초기화
   */
  clearOutput(): void {
    this.log("Clearing output buffer");
    this.outputMatcher.clear();
  }

  /**
   * 실행 상태 확인
   */
  isProcessRunning(): boolean {
    return this.isRunning;
  }

  /**
   * 시작 프롬프트 반환
   */
  getReadyPattern(): string | RegExp {
    return this.config.prompts.input;
  }

  /**
   * 타임아웃 설정 반환
   */
  getTimeouts() {
    return this.config.timeouts;
  }

  /**
   * 프롬프트 설정 반환
   */
  getPrompts() {
    return this.config.prompts;
  }
}
