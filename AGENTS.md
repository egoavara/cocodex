# Cocodex 프로젝트

## 🎯 프로젝트 목표

Cocodex는 **"AI 코딩 도구를 AI로 만들어보는"** 학습 프로젝트입니다. 
AI API를 활용하여 간단한 버전의 AI 코딩 CLI 도구를 직접 구현하면서 AI 에이전트의 작동 원리를 이해하는 것이 목표입니다.

## 📚 학습 목적

1. **AI API 활용법 습득**: OpenAI API를 실전에서 어떻게 사용하는지 학습
2. **AI 에이전트 아키텍처 이해**: Tool 기반 AI 시스템의 구조와 워크플로우 파악
3. **실전 구현 경험**: 단계별로 기능을 추가하며 완성도 있는 도구 제작

## 🗂️ 프로젝트 구조

### `/cocodex-typescript-langgraph/`
**TypeScript + LangGraph 버전** (메인 학습 자료)

- **대상 학습자**: AI 에이전트를 처음 만들어보는 개발자
- **핵심 기술 스택**:
  - TypeScript
  - OpenAI API
  - LangGraph (워크플로우 관리)
  - Node.js 25

- **구성**:
  - `README.md`: 전체 강의 교과서 (이론 + 실습 가이드)
  - `src/sample-00` ~ `src/sample-07`: 단계별 완성 코드 예제
  - `.devcontainer/`: 개발 환경 자동 설정
  - `package.json`: 단일 프로젝트로 모든 샘플 관리 (모노레포)

### `/cocodex-typescript-openaisdk/`
**TypeScript + OpenAI SDK 버전** (향후 추가 예정)

- **대상 학습자**: OpenAI SDK로 구현하고 싶은 개발자
- **핵심 기술 스택**:
  - TypeScript
  - OpenAI API
  - OpenAI SDK (워크플로우 관리)
  - Node.js 25

## 📖 학습 로드맵 (TypeScript + LangGraph)

각 단계는 이전 단계를 기반으로 점진적으로 기능을 추가합니다:

1. **sample-00**: 기본 CLI 프로젝트 설정
2. **sample-01**: OpenAI API 연동
3. **sample-02**: LangGraph 기초
4. **sample-03**: Tool 시스템 구현
5. **sample-04**: Agent 구조 설계
6. **sample-05**: 대화형 인터페이스
7. **sample-06**: 고급 기능 (멀티턴 대화)
8. **sample-07**: 실전 기능 완성

## 💡 핵심 학습 포인트

### AI 도구를 사용하는 방법
- AI API 호출 패턴
- 프롬프트 엔지니어링 기본
- Tool/Function Calling 메커니즘
- 에러 핸들링 및 재시도 로직

### AI API를 활용하는 방법
- OpenAI Chat Completions API
- Tool/Function 정의 및 실행
- 스트리밍 응답 처리
- 컨텍스트 관리 및 최적화

### 실전 구현 스킬
- TypeScript로 타입 안전한 AI 애플리케이션 개발
- LangGraph로 복잡한 워크플로우 관리
- CLI 도구 설계 및 사용자 경험 고려

## 📝 강의 자료 사용법

1. **메인 README 읽기**: `/cocodex-typescript-langgraph/README.md`에서 이론과 전체 흐름 파악
2. **단계별 실습**: 각 `sample-XX` 폴더의 README를 읽고 직접 코드 작성 시도
3. **막힐 때**: 같은 단계의 완성 코드 참고하여 해결
4. **다음 단계로**: 이전 단계를 이해했다면 다음 sample로 이동

## 🎓 학습 후 얻게 되는 것

- AI 코딩 도구(Claude Code, Cursor, GitHub Copilot 등)가 내부적으로 어떻게 작동하는지 이해
- 자신만의 커스텀 AI 도구를 만들 수 있는 능력
- OpenAI API를 활용한 다양한 AI 애플리케이션 개발 기반 지식

## ⚙️ 환경 변수

```bash
cp cocodex-typescript-langgraph/.env.example cocodex-typescript-langgraph/.env
```

### `OPENAI_API_KEY` (필수)
- OpenAI API 키: https://platform.openai.com/api-keys
- 형식: `sk-` 로 시작

### `OPENAI_MODEL`
- 기본값: `gpt-5`
- 지원: `gpt-5`, `gpt-4o`, `gpt-4o-mini`, `gpt-3.5-turbo`

### `OPENAI_TEMPERATURE`
- 기본값: `1` (GPT-5는 1만 지원)
- 범위: `0.0` ~ `2.0`

⚠️ **환경 변수 변경 시**: `.env.example`, `AGENTS.md`, 코드 기본값을 모두 업데이트하세요.
