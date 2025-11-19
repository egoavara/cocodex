# Cocodex: AI 코딩 CLI 도구 만들기

> TypeScript + LangGraph로 배우는 AI 에이전트 개발 (경력 3년+ 프로그래머 대상)

## 🎯 학습 목표

**Claude Code, Cursor, GitHub Copilot의 핵심 메커니즘**을 이해하고 구현합니다.

TypeScript/OpenAI API 기초는 넘어서, **AI 에이전트의 핵심 패턴과 고급 기술**에 집중합니다:
- ✅ Tool/Function Calling의 동작 원리
- ✅ Agent Loop 패턴
- ✅ LangGraph를 사용한 워크플로우 구조화
- ✅ 프로덕션급 컨텍스트 관리
- ✅ 고급 최적화 기법 (SubAgent, Compacting, 병렬 처리)

## 🚀 빠른 시작

```bash
# 1. 설치
npm install

# 2. API 키 설정
cp .env.example .env
# .env 파일에 OPENAI_API_KEY 입력

# 3. 샘플 실행
npm run sample-00  # 기초: Tool Loop
npm run sample-01  # 기초: LangGraph
npm run sample-02  # 기초: REPL
npm run sample-03  # 고급: Custom Command
npm run sample-04  # 고급: Context Loading
npm run sample-05  # 고급: SubAgent
npm run sample-06  # 고급: Compacting
npm run sample-07  # 고급: 병렬 처리
npm run sample-08  # 실전: 완성
```

## 📚 학습 구조

### 기초 편 (Sample 00-02): 핵심 메커니즘

#### Sample 00: Tool Loop의 핵심 ⭐⭐⭐⭐⭐

**가장 중요**: AI 에이전트의 동작 원리

```
사용자: "파일에 쓰고, 읽어서 알려줘"
   ↓
[반복 1] AI → write_file 호출 판단 → Tool 실행
[반복 2] AI → read_file 호출 판단 → Tool 실행  
[반복 3] AI → 최종 응답 생성
```

**핵심 포인트**:
- Tool Schema: JSON Schema로 AI에게 함수 설명
- `tool_calls`: AI의 "이 함수를 호출하라" 응답
- `role: "tool"`: Tool 결과를 AI에게 피드백
- Loop: AI → Tool → AI → ... → 최종 응답

#### Sample 01: LangGraph로 구조화 ⭐⭐⭐⭐

복잡한 while 루프를 **선언적 그래프**로 변환

```typescript
workflow.addConditionalEdges("agent", shouldContinue, {
  tools: "tools",  // tool_calls 있으면
  [END]: END,      // 없으면 종료
});
```

**장점**:
- 명확한 흐름 시각화
- 디버깅 용이
- 확장성 (새 노드 추가 간단)

#### Sample 02: 대화형 인터페이스 ⭐⭐⭐

REPL + Checkpoint + Message Pruning

**핵심**:
- 대화 히스토리 유지
- Checkpoint로 세션 관리
- Message Pruning으로 토큰 절약

---

### 고급 편 (Sample 03-07): 프로덕션 기술

#### Sample 03: Custom Command 시스템 ⭐⭐⭐⭐

사용자 정의 명령어로 확장 가능한 시스템

```typescript
// /search, /analyze 같은 명령어 정의
commandRegistry.register({
  name: "search",
  pattern: /^\/search\s+(.+)$/,
  handler: async (args) => {
    // 검색 로직
  },
});

// AI가 사용 가능
const tools = [...baseTools, ...commandRegistry.toToolSchemas()];
```

**장점**:
- 확장성: 코드 변경 없이 새 명령어 추가
- 재사용성: 복잡한 로직을 명령어로 캡슐화
- 메타 프로그래밍: AI가 동적으로 명령어 인지

**응용**:
- `/git-commit <message>`: Git 커밋
- `/deploy <env>`: 배포 자동화
- `/test <file>`: 테스트 실행

#### Sample 04: Context File Loading ⭐⭐⭐⭐

AGENTS.md 같은 프로젝트 규칙을 자동 로드

```typescript
contextManager.register("agents", "../../AGENTS.md", "프로젝트 목표");
contextManager.register("readme", "README.md", "사용법");

const systemMessage = await contextManager.buildSystemMessage();
// AI가 프로젝트 컨텍스트를 자동으로 이해
```

**장점**:
- 일관성: 프로젝트 규칙을 파일로 중앙 관리
- 자동화: AI가 자동으로 컨텍스트 이해
- 캐싱: 파일 변경 감지 및 효율적 로딩
- 버전 관리: Git으로 컨텍스트 변경 추적

**실전 활용**:
- `AGENTS.md`: 프로젝트 규칙
- `STYLE_GUIDE.md`: 코딩 스타일
- `API_SPEC.md`: API 문서

#### Sample 05: SubAgent 패턴 ⭐⭐⭐⭐⭐

컨텍스트가 분리된 전문 에이전트

```typescript
// 각 SubAgent는 독립된 컨텍스트
const codeAnalyzer = new SubAgent("CodeAnalyzer", systemPrompt, tools);
const fileExplorer = new SubAgent("FileExplorer", systemPrompt, tools);

// Main Agent가 작업 위임
const result = await codeAnalyzer.execute("sample-00/index.ts 분석");
```

**핵심 개념**:
- 전문화: 각 SubAgent는 특정 작업에 최적화
- 컨텍스트 격리: 독립된 대화 히스토리
- Delegation: Main Agent가 작업 분배
- 병렬 가능: 독립적인 SubAgent는 동시 실행

**실전 패턴**:
```
Main Agent
  ↓
  ├── CodeReviewer SubAgent
  ├── TestGenerator SubAgent
  ├── Documentation SubAgent
  └── Refactoring SubAgent
```

**장점**:
- 복잡한 작업을 여러 전문가에게 분산
- 각 SubAgent의 프롬프트를 독립적으로 최적화
- 디버깅: 어느 SubAgent가 문제인지 명확

#### Sample 06: Context Compacting ⭐⭐⭐⭐

긴 대화를 요약하여 토큰 절약

**3가지 전략**:

1. **Sliding Window** (빠름):
```typescript
const recentMessages = messages.slice(-20); // 최근 20개만
```

2. **Summarization** (정보 보존):
```typescript
const summary = await AI.summarize(oldMessages);
// 오래된 대화를 요약문으로 압축
```

3. **Adaptive** (상황에 따라):
```typescript
if (tokens < threshold) {
  return messages; // 압축 불필요
} else if (messages.length < 30) {
  return slidingWindow(messages);
} else {
  return await summarize(messages);
}
```

**성능 비교**:
```
압축 전: 50개 메시지, 5000 토큰
  ↓ Sliding Window
압축 후: 20개 메시지, 2000 토큰 (60% 절약)
  ↓ Summarization
압축 후: 5개 메시지, 500 토큰 (90% 절약, 정보 유지)
```

**장점**:
- 비용 절감: 토큰 사용량 최소화
- 성능: 컨텍스트가 작을수록 응답 빠름
- 확장성: 긴 대화도 제한 없이 가능

#### Sample 07: 비동기 병렬 Tool 호출 ⭐⭐⭐⭐⭐

여러 Tool을 동시에 실행하여 성능 최적화

**순차 vs 병렬**:

```typescript
// 순차 (느림)
for (const tool of tools) {
  await executeTool(tool);  // 1초씩 총 3초
}

// 병렬 (빠름)
await Promise.all(
  tools.map(tool => executeTool(tool))  // 동시 실행, 총 1초
);
```

**스마트 실행**: 의존성 분석

```typescript
// 같은 파일에 접근하는 Tool은 순차 실행
if (toolA.path === toolB.path) {
  await toolA(); // 먼저
  await toolB(); // 나중에
} else {
  await Promise.all([toolA(), toolB()]); // 병렬
}
```

**성능 향상**:
```
순차: read_file(1s) + read_file(1s) + analyze(0.5s) = 2.5초
병렬: max(1s, 1s, 0.5s) = 1초 (2.5배 빠름)
```

**주의사항**:
- 파일 쓰기 충돌 방지
- 리소스 제한 고려
- 일부 실패 시 처리

---

### 실전 편 (Sample 08)

모든 기술을 결합한 완전한 AI 코딩 도구

---

## 💡 핵심 개념 정리

### 1. Tool Schema = AI에게 함수 설명

```typescript
{
  name: "read_file",
  description: "파일의 내용을 읽습니다",  // 이게 전부!
  parameters: {
    type: "object",
    properties: {
      path: { type: "string" }
    }
  }
}
```

AI는 `description`만 보고 **언제 이 함수를 써야 할지** 판단합니다.

### 2. Tool Loop = 자율성

```
AI가 스스로:
1. 어떤 Tool을 사용할지 결정
2. 몇 번이나 Tool을 호출할지 결정
3. Tool 결과를 보고 다음 행동 결정
4. 최종 응답 시점 결정
```

### 3. Custom Command vs Tool

| | Custom Command | Tool |
|---|---|---|
| 정의 | 사용자가 직접 등록 | OpenAI API에 전달 |
| 실행 | 시스템에서 직접 | AI가 판단 후 호출 |
| 확장 | 런타임에 추가 가능 | 코드 변경 필요 |
| 용도 | 복잡한 워크플로우 | 단순 기능 |

### 4. SubAgent vs Single Agent

**Single Agent**:
- 모든 작업을 하나의 Agent가 처리
- 컨텍스트가 계속 쌓임
- 복잡해질수록 성능 저하

**SubAgent**:
- 작업별로 전문 Agent 분리
- 각 SubAgent는 독립 컨텍스트
- 병렬 처리 가능

### 5. Context Compacting 전략 선택

```typescript
if (tokens < threshold * 0.7) {
  // 압축 불필요
} else if (messages.length < 30) {
  // Sliding Window (빠름)
} else {
  // Summarization (정보 보존)
}
```

## 🎓 학습 완료 후

### 이제 할 수 있는 것

- ✅ OpenAI Function Calling 완전 이해
- ✅ LangGraph로 복잡한 워크플로우 설계
- ✅ Custom Command로 확장 가능한 시스템 구축
- ✅ Context File로 프로젝트 규칙 자동 주입
- ✅ SubAgent로 복잡한 작업 분산 처리
- ✅ Context Compacting으로 토큰 최적화
- ✅ 병렬 Tool 호출로 성능 향상

### 다음 단계

**더 많은 Tool 추가**:
- Git Tool (커밋, PR, 브랜치)
- Web Search Tool (실시간 정보)
- Database Tool (SQL 실행)
- Code Interpreter (Python 실행)

**고급 최적화**:
- Tool 결과 캐싱
- 예측적 Tool 로딩
- 멀티 모델 전략 (GPT-4 + GPT-3.5)

**프로덕션 배포**:
- Docker 컨테이너화
- API 서버로 변환
- 사용자 인증 및 권한
- 로깅 및 모니터링

## 📚 참고 자료

- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangGraph Tutorials](https://langchain-ai.github.io/langgraph/tutorials/)

## ❓ FAQ

**Q: 모든 샘플을 순서대로 해야 하나요?**  
A: 00-02는 필수, 03-07은 관심사에 따라 선택 가능합니다.

**Q: SubAgent와 LangGraph의 subgraph는 다른가요?**  
A: 네. SubAgent는 완전히 독립된 Agent입니다. LangGraph의 subgraph는 메인 그래프의 일부입니다.

**Q: 실제 프로덕션에서 Context Compacting은 필수인가요?**  
A: 긴 대화를 지원한다면 필수입니다. 토큰 한도 초과 시 서비스가 중단됩니다.

**Q: 병렬 Tool 호출 시 순서는 어떻게 되나요?**  
A: `Promise.all`은 순서를 보장하지 않습니다. 순서가 중요하면 의존성 분석 후 순차 실행하세요.

---

**🚀 Happy Coding!**
