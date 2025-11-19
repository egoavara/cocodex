# COCODEX 구현 스펙 (v1.0)

> 이 문서는 AI 코딩 CLI 도구 "COCODEX"의 완전한 구현 요구사항을 정의합니다.
> 이 스펙을 기반으로 **sample-06 수준의 완전한 대화형 AI 코딩 에이전트**를 구현할 수 있어야 합니다.

---

## 📋 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [핵심 아키텍처](#3-핵심-아키텍처)
4. [구현 요구사항](#4-구현-요구사항)
5. [디렉토리 구조](#5-디렉토리-구조)
6. [구현 체크리스트](#6-구현-체크리스트)

---

## 1. 프로젝트 개요

### 1.1 목표
TypeScript와 LangGraph를 활용하여 **대화형 AI 코딩 CLI 도구**를 구현합니다.

### 1.2 핵심 기능
- ✅ **OpenAI API 연동**: Function Calling을 활용한 Tool 시스템
- ✅ **LangGraph 워크플로우**: 상태 기반 에이전트 흐름 제어
- ✅ **Tool 시스템**: 파일 읽기/쓰기, 디렉토리 조회, CLI 명령 실행
- ✅ **세션 관리**: 대화 히스토리를 파일로 저장/로드
- ✅ **커스텀 명령어**: `.cocodex/commands/*.md` 파일 기반 명령어 정의
- ✅ **컨텍스트 로딩**: 재귀적으로 `cocoagent.md` 파일을 찾아 프로젝트 컨텍스트 로드
- ✅ **AI 기반 압축**: tiktoken을 사용한 토큰 계산 및 지능형 메시지 요약
- ✅ **멀티턴 대화**: 사용자와 AI가 채팅처럼 연속 대화

### 1.3 제외 사항
- 이미지 처리, 스트리밍 출력, MCP 연동 등은 이 스펙의 범위 밖입니다.

---

## 2. 기술 스택

### 2.1 필수 패키지
```json
{
  "dependencies": {
    "@langchain/core": "^0.3.28",
    "@langchain/langgraph": "^0.2.25",
    "@langchain/openai": "^0.3.18",
    "dotenv": "^16.4.7",
    "openai": "^4.77.3",
    "tiktoken": "^1.0.18"
  },
  "devDependencies": {
    "@types/node": "^22.10.2",
    "typescript": "^5.7.2"
  }
}
```

### 2.2 환경 변수 (.env)
```bash
OPENAI_API_KEY=sk-...           # 필수
OPENAI_MODEL=gpt-4o              # 기본값: gpt-4o
OPENAI_TEMPERATURE=0.2           # 기본값: 0.2 (GPT-5는 1 고정)
```

### 2.3 TypeScript 설정
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  }
}
```

---

## 3. 핵심 아키텍처

### 3.1 Tool Loop 메커니즘

AI 에이전트의 핵심은 **Tool Loop**입니다:

```
사용자 요청
  ↓
[AI 판단] "어떤 Tool을 사용할까?"
  ↓
Tool 호출 (read_file, write_file 등)
  ↓
Tool 결과를 AI에게 전달
  ↓
[AI 판단] "더 필요한 Tool이 있나?"
  ↓ (반복)
최종 응답
```

#### 핵심 개념
1. **Tool 정의 (JSON Schema)**: AI가 "언제 어떤 Tool을 사용할지" 판단하는 기준
2. **tool_calls**: AI가 "이 함수를 호출하라"는 지시를 포함한 응답
3. **role: 'tool'**: Tool 실행 결과를 AI에게 피드백
4. **자율성**: AI가 스스로 Tool 사용 여부와 순서를 결정

### 3.2 LangGraph 워크플로우

LangGraph는 **상태 기반 그래프**로 복잡한 에이전트 흐름을 선언적으로 표현합니다.

#### 기본 구조 (Sample-01 ~ Sample-02)
```
[START] → [agent] ⇄ [tools]
             ↓
           [END]
```

#### 압축 지원 구조 (Sample-05)
```
[START] → [agent] ⇄ [tools]
             ↓
      shouldContinue (3-way)
       ↙     ↓     ↘
   [tools] [compact] [END]
             ↓
           [END]
```

#### 멀티턴 대화 구조 (Sample-06)
```
[START] → [getUserInput] → [parseInput]
             ↑                  ↓
         (대화 계속)       routeInput (2-way)
                          ↙        ↘
                   [handleCommand] [addUserMessage]
                        ↓              ↓
                   routeCommand     [agent]
                     ↙  ↓  ↘           ↓
                [END][getUserInput][addMessage] shouldContinue
                       ↑          ↓        ↙    ↓    ↓    ↓
                       └────────[agent] [tools][compact][getUserInput][END]
```

### 3.3 State 정의

#### 기본 State (Sample-02)
```typescript
const GraphState = Annotation.Root({
  sessionId: Annotation<string>({ 
    reducer: (_, next) => next, 
    default: () => "" 
  }),
  iterations: Annotation<number>({ 
    reducer: (_, next) => next, 
    default: () => 0 
  }),
});
```

#### 명령어 지원 State (Sample-03)
```typescript
const GraphStateWithCommand = Annotation.Root({
  sessionId: Annotation<string>(),
  iterations: Annotation<number>(),
  userInput: Annotation<string | null>(),
  commandResult: Annotation<any>(),
});
```

#### 멀티턴 대화 State (Sample-06)
```typescript
const GraphStateWithDialog = Annotation.Root({
  sessionId: Annotation<string>(),
  iterations: Annotation<number>(),
  userInput: Annotation<string | null>(),
  commandResult: Annotation<any>(),
  shouldClose: Annotation<boolean>(), // 종료 플래그
});
```

---

## 4. 구현 요구사항

### 4.1 Tool Manager (ToolManager)

#### 위치
`src/tools.ts`

#### 책임
- 기본 Tool 세트 제공 및 동적 Tool 등록/해제
- Tool 실행 및 오류 처리
- OpenAI API 호출용 Tool Schema 생성

#### 기본 Tool 목록
1. **read_file**: 파일 내용 읽기
   - 파라미터: `path` (string)
   - 반환: 파일 내용 (string)

2. **write_file**: 파일에 내용 쓰기
   - 파라미터: `path` (string), `content` (string)
   - 반환: 성공 메시지 (string)

3. **list_dir**: 디렉토리 파일/폴더 목록 조회
   - 파라미터: `path` (string)
   - 반환: 항목 목록 (string, 줄바꿈 구분)

4. **execute**: CLI 명령 실행
   - 파라미터: `command` (string)
   - 반환: stdout 또는 stderr (string)
   - 타임아웃: 30초

#### 인터페이스
```typescript
export class ToolManager {
  // Tool 등록
  registerTool(schema: ToolSchema, executor: ToolExecutor): void;
  
  // Tool 제거
  unregisterTool(toolName: string): boolean;
  
  // OpenAI API용 Schema 배열 반환
  getToolSchemas(): ToolSchema[];
  
  // Tool 실행
  async executeTool(
    toolName: string, 
    args: any, 
    toolCallId?: string
  ): Promise<BaseMessage[]>;
  
  // Tool 존재 확인
  hasTool(toolName: string): boolean;
  
  // 모든 Tool 이름 반환
  getToolNames(): string[];
}
```

#### 구현 세부사항
- Tool 실행 시 오류는 `ToolMessage`로 래핑하여 반환
- `execute` Tool은 `child_process.exec`를 `promisify`하여 사용
- 각 Tool 실행 시 콘솔에 로그 출력

---

### 4.2 Session Manager (SessionManager)

#### 위치
`src/session.ts`

#### 책임
- 다중 세션 관리 (세션 ID 기반)
- 메시지 히스토리 관리
- 세션 파일 저장/로드 (`.cocodex/sessions/*.json`)
- 세션 메타데이터 관리

#### 주요 메서드
```typescript
export class SessionManager {
  // 새 세션 생성
  createSession(sessionId?: string, metadata?: Partial<SessionMetadata>): string;
  
  // 현재 세션 설정
  setCurrentSession(sessionId: string): boolean;
  
  // 세션 가져오기
  getSession(sessionId?: string): Session | null;
  
  // 메시지 추가
  addMessage(message: BaseMessage, sessionId?: string): void;
  addMessages(messages: BaseMessage[], sessionId?: string): void;
  
  // 메시지 전체 대치
  replaceMessages(messages: BaseMessage[], sessionId?: string): void;
  
  // 메시지 가져오기
  getMessages(sessionId?: string): BaseMessage[];
  getMessageCount(sessionId?: string): number;
  
  // 세션 저장/로드
  async saveSession(sessionId?: string): Promise<boolean>;
  async loadSession(sessionId: string): Promise<boolean>;
  
  // 세션 관리
  clearSession(sessionId?: string): void;
  deleteSession(sessionId: string): boolean;
}
```

#### Session 타입
```typescript
interface Session {
  id: string;
  messages: BaseMessage[];
  metadata: SessionMetadata;
}

interface SessionMetadata {
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  context?: Record<string, unknown>;
}
```

#### 구현 세부사항
- 세션 ID 형식: `session_{timestamp}_{random}`
- 파일 저장 위치: `.cocodex/sessions/{sessionId}.json`
- 메시지 직렬화: `type` 필드로 메시지 타입 저장 (human, ai, system, tool)
- 날짜는 ISO 문자열로 저장

---

### 4.3 Command Registry (CommandRegistry)

#### 위치
`src/commands.ts`

#### 책임
- `.cocodex/commands/*.md` 파일로 템플릿 명령어 정의
- 런타임 람다 함수로 명령어 등록
- 명령어 파싱 및 실행
- CommandResult 타입으로 결과 통일

#### CommandResult 타입
```typescript
export type CommandResult =
  | { type: "prompt"; message: string }   // AI에게 전달할 프롬프트
  | { type: "close" }                      // 대화 종료
  | { type: "executed" }                   // 실행 완료 (다시 입력 대기)
  | { type: "error"; message: string };    // 에러
```

#### CommandHandler 타입
```typescript
export interface CommandHandler {
  type: "template" | "lambda";
  description: string;
  template?: string;              // template 타입: ${ARGUMENTS} 플레이스홀더 포함
  handler?: CommandLambda;        // lambda 타입: 실행할 함수
}

export type CommandLambda = (
  args: string, 
  context?: any
) => Promise<CommandResult>;
```

#### 주요 메서드
```typescript
export class CommandRegistry {
  // 파일 기반 명령어 로드
  async loadCommands(): Promise<void>;
  
  // 람다 함수 명령어 등록
  register(
    commandName: string, 
    handler: CommandLambda, 
    description: string
  ): void;
  
  // 명령어 실행
  async execute(
    commandName: string, 
    args: string, 
    context?: any
  ): Promise<CommandResult>;
  
  // 명령어 목록 반환
  getCommandDescriptions(): string;
  
  // 명령어 체크
  isCommand(input: string): boolean;
  
  // 명령어 파싱
  parseCommand(input: string): { commandName: string; args: string } | null;
}
```

#### 템플릿 명령어 형식 (.cocodex/commands/*.md)
```markdown
---
description: 코드 분석
---

당신은 코드 분석 전문가입니다. 다음 파일을 분석하고 개선점을 제안하세요:

파일 경로: ${ARGUMENTS}

분석 내용:
1. 코드 구조와 설계 패턴
2. 잠재적 버그나 문제점
3. 성능 개선 가능성
4. 가독성 및 유지보수성
```

#### 구현 세부사항
- 명령어 형식: `/명령어 인자`
- `${ARGUMENTS}` 플레이스홀더를 사용자 입력으로 치환
- YAML Front Matter로 메타데이터 파싱
- 정규식: `/^\/(\w+)(?:\s+(.+))?$/`

---

### 4.4 Context Manager (ContextManager)

#### 위치
`src/context.ts`

#### 책임
- 재귀적으로 부모 폴더를 탐색하여 `cocoagent.md` 파일 발견
- 부모 → 현재 순서로 계층적 컨텍스트 구성
- 첫 번째 User 메시지 생성

#### 주요 메서드
```typescript
export class ContextManager {
  constructor(startDir: string = process.cwd());
  
  // cocoagent.md 파일 탐색
  async findCocoagentFiles(): Promise<ContextFile[]>;
  
  // 초기 User 메시지 생성
  async buildInitialUserMessage(): Promise<string>;
  
  // 컨텍스트 파일 목록만 반환
  async getContextFiles(): Promise<ContextFile[]>;
}
```

#### ContextFile 타입
```typescript
interface ContextFile {
  path: string;
  content: string;
  level: number;  // 0: 최상위 부모, 1+: 중간/현재
}
```

#### 구현 세부사항
- 최대 10단계까지 부모 폴더 탐색
- `unshift`로 부모 → 현재 순서 유지
- 메시지 형식:
```
다음은 이 프로젝트에 대한 컨텍스트 정보입니다.

============================================================
[COCOAGENT - 프로젝트 루트]
파일 위치: /path/to/cocoagent.md
============================================================

{내용}

...

============================================================
위 컨텍스트를 참고하여 프로젝트 규칙과 가이드라인을 준수하면서 사용자를 도와주세요.
```

---

### 4.5 Context Compactor (ContextCompactor)

#### 위치
`src/compactor.ts`

#### 책임
- tiktoken을 사용한 정확한 토큰 계산
- Context window 사용률 체크
- AI를 활용한 메시지 요약
- 시스템 메시지 및 최근 메시지 보존

#### CompactionOptions
```typescript
interface CompactionOptions {
  contextWindowSize: number;      // 기본값: 128000
  threshold: number;              // 기본값: 0.7 (70%)
  preserveRecentCount: number;    // 기본값: 4
}
```

#### CompactionResult
```typescript
interface CompactionResult {
  compacted: boolean;
  originalCount: number;
  compactedCount: number;
  originalTokens: number;
  compactedTokens: number;
  messages: BaseMessage[];
}
```

#### 주요 메서드
```typescript
export class ContextCompactor {
  constructor(options?: Partial<CompactionOptions>);
  
  // 토큰 수 계산
  estimateTokens(messages: BaseMessage[]): number;
  
  // 압축 필요 여부 판단
  shouldCompact(messages: BaseMessage[]): boolean;
  
  // 메시지 압축
  async compactMessages(
    messages: BaseMessage[], 
    force?: boolean
  ): Promise<CompactionResult>;
  
  // /compact 명령어 핸들러
  handlerCompact(sessionManager: SessionManager): CommandLambda;
  
  // /status 명령어 핸들러
  handlerStatus(sessionManager: SessionManager): CommandLambda;
}
```

#### 구현 세부사항
- `encoding_for_model`로 정확한 토큰 계산
- 압축 로직:
  1. 시스템 메시지 분리
  2. 최근 N개 메시지 보존
  3. 중간 메시지들을 AI로 요약
  4. `[이전 대화 요약]` SystemMessage로 삽입
- 요약 프롬프트: 핵심 작업, 수행된 작업, 중요한 컨텍스트 포함

---

### 4.6 LangGraph 노드 팩토리 함수

#### 기본 노드 (Sample-02에서 정의, 재사용 가능)

##### createCallAgent
```typescript
export function createCallAgent(
  sessionManager: SessionManager,
  toolManager: ToolManager,
) {
  return async (state: typeof GraphState.State) => {
    const model = new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL || "gpt-4o",
      temperature: parseFloat(process.env.OPENAI_TEMPERATURE || "0.2"),
    }).bindTools(toolManager.getToolSchemas());
    
    const messages = sessionManager.getMessages(state.sessionId);
    const response = await model.invoke(messages);
    
    sessionManager.addMessage(response, state.sessionId);
    
    return {
      iterations: state.iterations + 1,
    };
  };
}
```

##### createExecuteTools
```typescript
export function createExecuteTools(
  sessionManager: SessionManager,
  toolManager: ToolManager,
) {
  return async (state: typeof GraphState.State) => {
    const messages = sessionManager.getMessages(state.sessionId);
    const lastMessage = messages[messages.length - 1] as AIMessage;
    
    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return {};
    }
    
    const toolMessages: BaseMessage[] = [];
    
    for (const toolCall of lastMessage.tool_calls) {
      const result = await toolManager.executeTool(
        toolCall.name,
        toolCall.args,
        toolCall.id || "",
      );
      toolMessages.push(...result);
    }
    
    sessionManager.addMessages(toolMessages, state.sessionId);
    
    return {};
  };
}
```

##### createShouldContinue (기본 2-way)
```typescript
export function createShouldContinue(
  sessionManager: SessionManager,
  maxIterations: number = 10,
) {
  return (state: typeof GraphState.State): string => {
    if (state.iterations >= maxIterations) {
      return END;
    }
    
    const messages = sessionManager.getMessages(state.sessionId);
    const lastMessage = messages[messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    
    return END;
  };
}
```

#### 압축 노드 (Sample-05에서 정의)

##### createCompactNode
```typescript
export function createCompactNode(
  sessionManager: SessionManager,
  compactor: ContextCompactor,
) {
  return async (state: typeof GraphState.State) => {
    const messages = sessionManager.getMessages(state.sessionId);
    const result = await compactor.compactMessages(messages);
    
    if (result.compacted) {
      sessionManager.replaceMessages(result.messages, state.sessionId);
    }
    
    return {};
  };
}
```

##### createShouldContinueWithCompact (3-way)
```typescript
export function createShouldContinueWithCompact(
  sessionManager: SessionManager,
  compactor: ContextCompactor,
  maxIterations: number = 10,
) {
  return (state: typeof GraphState.State): string => {
    if (state.iterations >= maxIterations) {
      return END;
    }
    
    const messages = sessionManager.getMessages(state.sessionId);
    const lastMessage = messages[messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    
    if (compactor.shouldCompact(messages)) {
      return "compact";
    }
    
    return END;
  };
}
```

#### 명령어 노드 (Sample-03에서 정의)

##### createParseInputNode
```typescript
export function createParseInputNode(commandRegistry: CommandRegistry) {
  return async (state: any) => {
    const userInput = state.userInput;
    
    if (!userInput) {
      return {};
    }
    
    if (!commandRegistry.isCommand(userInput)) {
      return { commandResult: null };
    }
    
    const parsed = commandRegistry.parseCommand(userInput);
    if (!parsed) {
      return {
        commandResult: { type: "error", message: "명령어 파싱 실패" }
      };
    }
    
    return {
      commandResult: {
        type: "parsed",
        commandName: parsed.commandName,
        args: parsed.args,
      }
    };
  };
}
```

##### createHandleCommandNode
```typescript
export function createHandleCommandNode(commandRegistry: CommandRegistry) {
  return async (state: any) => {
    const commandResult = state.commandResult;
    
    if (!commandResult || !("commandName" in commandResult)) {
      return {
        commandResult: { type: "error", message: "잘못된 명령어 상태" }
      };
    }
    
    const result = await commandRegistry.execute(
      commandResult.commandName,
      commandResult.args,
      { ...state },
    );
    
    return { commandResult: result };
  };
}
```

#### 대화 노드 (Sample-06에서 정의)

##### createGetUserInputNode
```typescript
export function createGetUserInputNode(
  rl: readline.Interface,
  sessionManager: SessionManager,
) {
  return async (state: typeof GraphStateWithDialog.State) => {
    // AI 응답 출력
    const messages = sessionManager.getMessages(state.sessionId);
    if (messages.length > 1) {
      const lastMessage = messages[messages.length - 1] as AIMessage;
      if (lastMessage._getType() === "ai") {
        console.log(`\n🤖 AI:\n${lastMessage.content}\n`);
      }
    }
    
    // 사용자 입력 받기
    const userInput = await rl.question("\n💬 You: ");
    const input = userInput.trim();
    
    if (input === "") {
      return { shouldClose: true };
    }
    
    return {
      userInput: input,
      iterations: 0,
    };
  };
}
```

##### createAddMessageNode
```typescript
export function createAddMessageNode(sessionManager: SessionManager) {
  return async (state: typeof GraphStateWithDialog.State) => {
    const result: CommandResult = state.commandResult;
    
    if (result.type === "prompt") {
      sessionManager.addMessage(
        new HumanMessage(result.message),
        state.sessionId,
      );
    }
    
    return {};
  };
}
```

##### createAddUserMessageNode
```typescript
export function createAddUserMessageNode(sessionManager: SessionManager) {
  return async (state: typeof GraphStateWithDialog.State) => {
    if (state.userInput) {
      sessionManager.addMessage(
        new HumanMessage(state.userInput),
        state.sessionId,
      );
    }
    return {};
  };
}
```

#### 라우터 (Sample-06에서 정의)

##### createRouteInput
```typescript
export function createRouteInput() {
  return (state: typeof GraphStateWithDialog.State): string => {
    if (state.commandResult === null) {
      return "agent";
    }
    return "handleCommand";
  };
}
```

##### createRouteCommand
```typescript
export function createRouteCommand(commandRegistry: CommandRegistry) {
  return (state: typeof GraphStateWithDialog.State): string => {
    const result: CommandResult = state.commandResult;
    
    if (result.type === "close") {
      return END;
    }
    
    if (result.type === "error") {
      console.log(`\n${result.message}`);
      return "getUserInput";
    }
    
    if (result.type === "executed") {
      return "getUserInput";
    }
    
    if (result.type === "prompt") {
      return "addMessage";
    }
    
    return "getUserInput";
  };
}
```

##### createShouldContinue (멀티턴용 4-way)
```typescript
export function createShouldContinue(
  sessionManager: SessionManager,
  compactor: ContextCompactor,
  maxIterations: number = 10,
) {
  return (state: typeof GraphStateWithDialog.State): string => {
    if (state.shouldClose) {
      return END;
    }
    
    if (state.iterations >= maxIterations) {
      return END;
    }
    
    const messages = sessionManager.getMessages(state.sessionId);
    const lastMessage = messages[messages.length - 1] as AIMessage;
    
    if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
      return "tools";
    }
    
    if (compactor.shouldCompact(messages)) {
      return "compact";
    }
    
    return "getUserInput";
  };
}
```

---

### 4.7 메인 프로그램 구현 (Sample-06 수준)

#### 위치
`src/index.ts`

#### 흐름
```typescript
async function main() {
  // 1. 환경 변수 로드
  dotenv.config();
  
  // 2. Manager 인스턴스 생성
  const toolManager = new ToolManager();
  const contextManager = new ContextManager();
  const sessionManager = new SessionManager(".cocodex/sessions");
  const commandRegistry = new CommandRegistry();
  const compactor = new ContextCompactor({
    contextWindowSize: 128000,
    threshold: 0.7,
    preserveRecentCount: 4,
  });
  
  // 3. 컨텍스트 및 명령어 로드
  const initialContext = await contextManager.buildInitialUserMessage();
  await commandRegistry.loadCommands();
  
  // 4. 특수 명령어 등록
  commandRegistry.register("compact", compactor.handlerCompact(sessionManager), "세션 압축");
  commandRegistry.register("status", compactor.handlerStatus(sessionManager), "세션 상태");
  commandRegistry.register("close", async () => ({ type: "close" }), "대화 종료");
  
  // 5. Readline 인터페이스 생성
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  // 6. 세션 생성 및 초기 컨텍스트 주입
  const sessionId = sessionManager.createSession();
  sessionManager.addMessage(new HumanMessage(initialContext), sessionId);
  
  // 7. LangGraph 에이전트 생성
  const app = createAgent(rl);
  
  // 8. 대화 루프 시작
  await app.invoke({
    sessionId,
    iterations: 0,
    userInput: null,
    commandResult: null,
    shouldClose: false,
  });
  
  // 9. 종료 처리
  rl.close();
  await sessionManager.saveSession(sessionId);
}
```

#### createAgent 함수
```typescript
function createAgent(rl: readline.Interface) {
  const getUserInputNode = createGetUserInputNode(rl, sessionManager);
  const addMessageNode = createAddMessageNode(sessionManager);
  const addUserMessageNode = createAddUserMessageNode(sessionManager);
  const routeInput = createRouteInput();
  const routeCommand = createRouteCommand(commandRegistry);
  const shouldContinue = createShouldContinue(sessionManager, compactor);
  
  const workflow = new StateGraph(GraphStateWithDialog)
    .addNode("getUserInput", getUserInputNode)
    .addNode("parseInput", parseInputNode)
    .addNode("handleCommand", handleCommandNode)
    .addNode("addMessage", addMessageNode)
    .addNode("addUserMessage", addUserMessageNode)
    .addNode("agent", callAgent)
    .addNode("tools", executeTools)
    .addNode("compact", compactNode)
    .addEdge(START, "getUserInput")
    .addEdge("getUserInput", "parseInput")
    .addConditionalEdges("parseInput", routeInput, {
      handleCommand: "handleCommand",
      agent: "addUserMessage",
    })
    .addEdge("addUserMessage", "agent")
    .addConditionalEdges("handleCommand", routeCommand, {
      [END]: END,
      getUserInput: "getUserInput",
      addMessage: "addMessage",
    })
    .addEdge("addMessage", "agent")
    .addConditionalEdges("agent", shouldContinue, {
      tools: "tools",
      compact: "compact",
      getUserInput: "getUserInput",
      [END]: END,
    })
    .addEdge("tools", "agent")
    .addEdge("compact", END);
  
  return workflow.compile();
}
```

---

## 5. 디렉토리 구조

```
project-root/
├── .cocodex/
│   ├── commands/         # 커스텀 명령어 정의 (.md 파일)
│   │   ├── analyze.md
│   │   ├── explain.md
│   │   └── review.md
│   └── sessions/         # 세션 저장 파일 (.json)
│       ├── session_xxx.json
│       └── ...
├── src/
│   ├── index.ts          # 메인 프로그램
│   ├── tools.ts          # ToolManager
│   ├── session.ts        # SessionManager
│   ├── commands.ts       # CommandRegistry
│   ├── context.ts        # ContextManager
│   └── compactor.ts      # ContextCompactor
├── cocoagent.md          # 프로젝트 컨텍스트 파일
├── .env                  # 환경 변수
├── package.json
└── tsconfig.json
```

---

## 6. 구현 체크리스트

### 6.1 기본 구현 (Sample-00 ~ Sample-02)
- [ ] OpenAI API 연동 및 Tool Loop 구현
- [ ] ToolManager: 기본 Tool 세트 (read_file, write_file, list_dir, execute)
- [ ] LangGraph: StateGraph 및 기본 노드 구현 (agent, tools)
- [ ] SessionManager: 세션 생성, 메시지 관리, 파일 저장/로드

### 6.2 고급 기능 (Sample-03 ~ Sample-04)
- [ ] CommandRegistry: 템플릿 명령어 및 람다 명령어 지원
- [ ] `.cocodex/commands/*.md` 파일 파싱 (YAML Front Matter + 본문)
- [ ] ContextManager: 재귀적 `cocoagent.md` 탐색 및 초기 메시지 생성

### 6.3 컨텍스트 압축 (Sample-05)
- [ ] ContextCompactor: tiktoken 기반 토큰 계산
- [ ] AI 기반 메시지 요약 및 압축
- [ ] 3-way 라우터 구현 (tools/compact/END)
- [ ] `/compact` 및 `/status` 명령어 핸들러

### 6.4 멀티턴 대화 (Sample-06)
- [ ] GraphStateWithDialog: 대화 제어를 위한 State 확장
- [ ] getUserInput 노드: readline으로 사용자 입력 받기
- [ ] parseInput/handleCommand 노드: 명령어 처리 파이프라인
- [ ] 복잡한 라우팅: routeInput (2-way), routeCommand (4-way), shouldContinue (4-way)
- [ ] `/close` 명령어 및 빈 입력으로 종료

### 6.5 통합 테스트
- [ ] 단일 턴 대화: 사용자 질문 → AI 응답 → 종료
- [ ] 멀티턴 대화: 연속 질문 및 응답
- [ ] Tool 사용: 파일 읽기/쓰기, 디렉토리 조회, CLI 실행
- [ ] 커스텀 명령어: `/analyze`, `/explain`, `/review`
- [ ] 컨텍스트 로딩: `cocoagent.md` 파일 자동 탐색 및 주입
- [ ] 컨텍스트 압축: 임계값 초과 시 자동 압축
- [ ] 세션 관리: 저장/로드 기능

---

## 7. 주요 구현 팁

### 7.1 Tool Schema 정의
- `description`이 매우 중요: AI가 이 설명만 보고 Tool 사용 여부를 판단합니다.
- 파라미터는 JSON Schema로 명확하게 정의하세요.

### 7.2 LangGraph State Reducer
- `reducer: (_, next) => next`: 덮어쓰기
- `reducer: (prev, next) => prev.concat(next)`: 누적 (messages)

### 7.3 비동기 오류 처리
- Tool 실행 실패는 오류 메시지를 `ToolMessage`로 래핑하여 AI에게 피드백합니다.
- 세션 저장 실패는 콘솔에 로그하고 계속 진행합니다.

### 7.4 토큰 계산
- tiktoken의 `encoding_for_model`을 사용하여 정확한 토큰 수를 계산합니다.
- 메타데이터 오버헤드를 고려하세요 (메시지당 약 4 토큰).

### 7.5 명령어 우선순위
- 명령어는 일반 메시지보다 먼저 처리되어야 합니다.
- `parseInput` → `routeInput` 흐름으로 명령어 검증을 먼저 수행하세요.

### 7.6 종료 조건
- `shouldClose` 플래그 또는 `CommandResult.type === "close"`로 명시적 종료
- `iterations >= maxIterations`로 무한 루프 방지
- readline EOF 또는 빈 입력으로 대화 종료

---

## 8. 예제 실행 시나리오

### 시나리오 1: 단일 질문
```
💬 You: 이 프로젝트의 구조를 설명해줘

🤖 AI: 이 프로젝트는 TypeScript와 LangGraph를 활용한 AI 코딩 CLI 도구입니다. 
주요 구성 요소는...
```

### 시나리오 2: 파일 작업
```
💬 You: src/index.ts 파일을 읽어서 분석해줘

🔧 [Tool] read_file({ path: "src/index.ts" })
✅ [Result] 읽기 성공 (1234자)

🤖 AI: 이 파일은 메인 프로그램으로...
```

### 시나리오 3: 커스텀 명령어
```
💬 You: /analyze src/tools.ts

🎯 명령어: /analyze
📝 인자: src/tools.ts

💬 생성된 프롬프트:
당신은 코드 분석 전문가입니다. 다음 파일을 분석하고 개선점을 제안하세요...

🔧 [Tool] read_file({ path: "src/tools.ts" })

🤖 AI: 이 ToolManager 클래스는...
```

### 시나리오 4: 멀티턴 대화
```
💬 You: 이 프로젝트의 목표가 뭐야?

🤖 AI: 이 프로젝트는 AI 코딩 도구를 만드는 학습 프로젝트입니다.

💬 You: LangGraph는 왜 사용하는 거야?

🤖 AI: LangGraph는 복잡한 에이전트 흐름을 선언적으로 표현하기 위해...

💬 You: /close

👋 대화를 종료합니다.
```

---

## 9. 최종 검증

구현 완료 후 다음을 확인하세요:

1. ✅ **기본 대화**: 단일 질문에 AI가 정확히 응답하는가?
2. ✅ **Tool 사용**: AI가 필요할 때 Tool을 자동으로 호출하는가?
3. ✅ **멀티턴**: 연속 대화가 끊기지 않고 진행되는가?
4. ✅ **명령어**: `/analyze`, `/compact`, `/status`, `/close`가 정상 작동하는가?
5. ✅ **컨텍스트**: `cocoagent.md`가 자동으로 로드되어 AI가 참고하는가?
6. ✅ **압축**: 임계값 초과 시 자동으로 압축되는가?
7. ✅ **세션**: 대화 종료 후 `.cocodex/sessions/` 폴더에 저장되는가?

---

## 10. 참고 자료

- **OpenAI API**: https://platform.openai.com/docs/api-reference/chat
- **LangGraph**: https://langchain-ai.github.io/langgraph/
- **LangChain**: https://js.langchain.com/docs/
- **tiktoken**: https://github.com/openai/tiktoken

---

**이 스펙 문서를 기반으로 AI Agent에게 "COCODEX를 구현해줘"라고 요청하면, sample-06 수준의 완전한 대화형 AI 코딩 도구가 구현되어야 합니다.**
