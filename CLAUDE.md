# CLAUDE.md

## 프로젝트 개요

**Cocodex**는 AI 코딩 CLI 도구(Claude Code, Codex 등)의 작동 원리를 이해하기 위한 학습 프로젝트입니다.

## 기술 스택

- TypeScript + Node.js 25
- OpenAI API + LangGraph
- MCP (Model Context Protocol)

## 프로젝트 구조

```
cocodex/
├── cocodex-typescript-langgraph/   # 메인 학습 자료
│   └── src/
│       ├── sample-00~06/           # 단계별 학습 코드
│       └── improve-00~02/          # 고급 기능 (이미지, 스트림, MCP)
├── cocodex-typescript-openaisdk/   # OpenAI SDK 버전 (예정)
└── cocodex-implements/             # 구현체
```

## 개발 환경

```bash
cd cocodex-typescript-langgraph
npm install
cp .env.example .env  # OPENAI_API_KEY 설정
npm run sample-00     # 실행
```

## 핵심 학습 단계

| 단계 | 주제 |
|------|------|
| sample-00 | CLI 프로젝트 설정 |
| sample-01 | Tool 시스템 (`tools.ts`) |
| sample-02 | LangGraph Agent Loop (`session.ts`) |
| sample-03 | 명령어 시스템 (`commands.ts`) |
| sample-04 | 컨텍스트 관리 (`context.ts`) |
| sample-05 | 컨텍스트 압축 (`compactor.ts`) |
| sample-06 | 멀티턴 대화형 인터페이스 |

## 코드 스타일

- Biome 사용 (`biome.json`)
- ESM 모듈 (`"type": "module"`)
- tsx로 직접 실행

## 주요 명령어

```bash
npm run sample-{00-06}  # 각 단계 실행
npm run improve-{00-02} # 고급 기능 실행
npm run build           # TypeScript 빌드
```
