# CLAUDE.md

## 프로젝트 목표

AI 코딩 CLI 도구(Claude Code, Codex, Gemini CLI)의 **작동 원리를 이해**하기 위한 학습 프로젝트.

## AI 코딩 도구의 핵심 구성요소

이 프로젝트에서 학습하는 AI 에이전트의 핵심 개념:

| 구성요소 | 설명 |
|----------|------|
| **Tool/Function Calling** | AI가 외부 도구(파일 읽기, 코드 실행 등)를 호출하는 메커니즘 |
| **Agent Loop** | Tool 호출 → 결과 반환 → AI 판단 → 반복의 순환 구조 |
| **Session Management** | 대화 히스토리 유지 및 상태 관리 |
| **Context Management** | 시스템 프롬프트, 파일 컨텍스트 등 AI에게 제공되는 정보 |
| **Context Compaction** | 토큰 한도 내에서 컨텍스트를 압축하는 전략 |
| **Command System** | `/help`, `/clear` 같은 사용자 명령어 처리 |

## 프로젝트 구조

```
cocodex/
├── cocodex-typescript-langgraph/   # TypeScript + LangGraph 구현
├── cocodex-typescript-openaisdk/   # OpenAI SDK 구현 (예정)
└── cocodex-implements/             # 실제 구현체
```

각 서브 프로젝트의 상세 내용은 해당 디렉토리의 README 참조.
