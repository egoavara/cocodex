# Cocodex: AI 코딩 도구 만들기

> AI로 AI 코딩 도구를 만들어보는 학습 프로젝트

## 🎯 프로젝트 소개

Cocodex는 **OpenAI API**를 활용하여 Claude Code, Codex, Gemini CLI 같은 AI 코딩 도구를 직접 만들어보는 학습 프로젝트입니다.

단순히 AI API를 호출하는 것을 넘어, Tool/Function Calling, Agent Loop, 워크플로우 관리 등 실전 AI 에이전트의 작동 원리를 이해하고 구현할 수 있습니다.

## 📚 학습 자료

### 🟦 TypeScript + LangGraph (권장)

**경로**: [`/cocodex-typescript-langgraph/`](./cocodex-typescript-langgraph/)

- **대상**: AI 에이전트를 처음 만들어보는 개발자
- **기술 스택**: TypeScript, OpenAI API, LangGraph, Node.js 25
- **특징**: 
  - 상태 기반 워크플로우로 복잡한 로직을 시각적으로 설계
  - 8단계 점진적 학습 (sample-00 ~ sample-07)
  - 완전한 문서와 예제 코드 제공

**시작하기**:
```bash
cd cocodex-typescript-langgraph
npm install
cp .env.example .env
# .env 파일에 OpenAI API 키 입력

npm run sample-00  # 첫 번째 샘플 실행
```

## 🚀 빠른 시작

### 1. 개발 환경 설정

**DevContainer 사용 (권장)**:
```bash
# VS Code로 프로젝트 열기
code cocodex-typescript-langgraph

# 명령 팔레트 (Ctrl+Shift+P 또는 Cmd+Shift+P)
# "Dev Containers: Reopen in Container" 선택
```

**로컬 환경**:
```bash
# Node.js 25 설치 필요
node --version  # v25.x.x

cd cocodex-typescript-langgraph
npm install
```

### 2. OpenAI API 키 발급

1. [OpenAI Platform](https://platform.openai.com/api-keys) 접속
2. "Create new secret key" 클릭
3. 생성된 키를 `.env` 파일에 저장:
   ```
   OPENAI_API_KEY=sk-your-api-key-here
   ```

### 3. 첫 번째 샘플 실행

```bash
cd cocodex-typescript-langgraph
npm run sample-00
```

## 💡 학습 목표

이 프로젝트를 완료하면:

✅ **OpenAI API 활용**: Chat Completions, Function Calling 완벽 이해  
✅ **AI 에이전트 설계**: LangGraph로 복잡한 워크플로우 구성  
✅ **실전 구현 능력**: 타입 안전한 TypeScript 기반 CLI 도구 제작  
✅ **내부 동작 이해**: AI 코딩 도구가 어떻게 작동하는지 파악  

## 🎓 누구를 위한 프로젝트인가요?

- **AI API를 처음 사용하는 개발자**: 단계별로 쉽게 따라하며 학습
- **AI 에이전트 작동 원리를 알아보고 싶은 개발자**: 구성 요소 단위로 분석하며 각 기능에 대한 이해

## 📚 참고 자료

- [OpenAI API Documentation](https://platform.openai.com/docs)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 🤝 기여하기

이슈나 PR을 환영합니다! 학습 자료를 함께 개선해주세요.

## 📄 라이센스

학습 목적으로 제작되었습니다. 자유롭게 학습하고 수정하여 사용하세요.

---

**Happy Coding! 🚀**
