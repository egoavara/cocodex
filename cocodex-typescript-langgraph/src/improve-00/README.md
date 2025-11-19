# Improve-00: 이미지 읽기 Tool

## 🎯 목표

AI가 스스로 판단하여 이미지 파일을 읽고 분석할 수 있도록 `read_image` Tool을 추가합니다.

## 📊 Sample-06과의 차이점

### 공통점 (Sample-06과 동일)
- ✅ 멀티턴 대화형 인터페이스
- ✅ Command-first Architecture
- ✅ 자동 컨텍스트 압축
- ✅ 세션 관리 및 저장

### 차이점 (Improve-00에서 추가)
- ⭐ **read_image Tool 추가**: 이미지 파일을 읽고 base64로 인코딩
- ⭐ **Vision API 자동 활용**: AI가 이미지 내용을 분석
- ⭐ **동적 Tool 등록**: `ToolManager.registerTool()`로 런타임에 추가

## 🔨 구현 방식

### 1. Tool 정의 분리 (`image-tool.ts`)

```typescript
// Tool 스키마
export const imageToolSchema: ToolSchema = {
  type: "function",
  function: {
    name: "read_image",
    description: "이미지 파일(PNG, JPG, JPEG, GIF, WEBP)을 읽어서 내용을 분석합니다...",
    parameters: { ... }
  }
};

// Tool 실행 함수
export const imageToolExecutor: ToolExecutor = async (args) => {
  // 1. 파일 읽기
  // 2. Base64 인코딩
  // 3. MIME 타입 감지
  // 4. Data URL 반환
};
```

### 2. 메인 파일에서 Tool 등록 (`index.ts`)

```typescript
import { imageToolSchema, imageToolExecutor } from "./image-tool.js";

const toolManager = new ToolManager();

// 🎯 핵심: 동적 Tool 등록
toolManager.registerTool(imageToolSchema, imageToolExecutor);

// 나머지는 Sample-06과 100% 동일
```

## 💡 사용 예시

### 예시 1: 기본 이미지 분석

```
💬 You: test.png를 분석해줘

  🔀 [RouteInput] → agent 노드
  
  🔧 [Tool] read_image({"path":"test.png"})
  ✅ [Result] 이미지 읽기 성공 (150KB)

🤖 AI:
이 이미지는 고양이 사진입니다. 
흰색 배경에 회색 고양이가 앉아있으며,
카메라를 바라보고 있습니다...
```

### 예시 2: 멀티턴 대화

```
💬 You: logo.png를 읽어줘

🤖 AI:
로고 이미지를 분석했습니다.
파란색 배경에 흰색 글자로 "Cocodex"라고 쓰여있습니다...

💬 You: 이 로고의 주요 색상은 뭐야?

🤖 AI:
이전에 분석한 로고의 주요 색상은 다음과 같습니다:
- 배경: #3498DB (밝은 파란색)
- 글자: #FFFFFF (흰색)
```

### 예시 3: 여러 Tool 조합

```
💬 You: 현재 디렉토리의 이미지 파일을 찾아서 분석해줘

🤖 AI:
(1) list_dir("./") 실행
(2) test.png 발견
(3) read_image("test.png") 실행
(4) 이미지 분석 결과 제공
```

## 🔧 Tool 스키마

### read_image

- **이름**: `read_image`
- **설명**: 이미지 파일을 읽어서 내용을 분석합니다
- **파라미터**: 
  - `path` (string, required): 이미지 파일 경로
- **반환값**: base64 인코딩된 데이터 URL
  - 형식: `data:image/png;base64,iVBORw0KG...`
- **지원 형식**: PNG, JPG, JPEG, GIF, WEBP

## 🚀 실행 방법

```bash
# 1. 프로젝트 루트로 이동
cd /path/to/cocodex-typescript-langgraph

# 2. Improve-00 실행
npm run improve-00

# 3. 대화 시작
💬 You: test.png를 분석해줘
```

## 📚 핵심 학습 내용

### 1. 동적 Tool 등록
- ToolManager는 `registerTool()` 메서드를 제공
- 런타임에 Tool을 추가할 수 있음
- 기존 코드를 수정하지 않고 확장 가능

### 2. AI Tool Selection
- AI가 사용자 요청을 분석하여 적절한 Tool 선택
- Tool의 `description`이 AI 판단의 핵심 기준
- "이미지", "분석", ".png" 등의 키워드로 판단

### 3. Vision API
- LangChain이 base64 이미지를 자동으로 Vision API에 전달
- 별도의 API 호출 코드 불필요
- GPT-4o, GPT-5 등의 모델이 Vision 지원

### 4. 코드 격리
- Sample-01~06 파일을 전혀 수정하지 않음
- Tool 정의만 별도 파일로 분리
- 재사용 가능한 구조

### 5. Tool Description의 중요성
- 명확한 설명: "이미지 파일을 읽어서 내용을 분석합니다"
- 지원 형식 명시: "PNG, JPG, JPEG, GIF, WEBP"
- 사용 시점 힌트: "사용자가 이미지 파일 분석을 요청하면 이 도구를 사용하세요"

## ⚠️ 주의사항

1. **모델 선택**: `.env`의 `OPENAI_MODEL`이 Vision을 지원하는지 확인
   - ✅ gpt-4o, gpt-4o-mini, gpt-5
   - ❌ gpt-3.5-turbo

2. **파일 크기**: 큰 이미지는 base64 인코딩 후 크기가 증가
   - 권장: 5MB 이하
   - OpenAI API 제한 고려

3. **API 비용**: Vision API는 텍스트 API보다 비용이 높음
   - 이미지 해상도에 따라 비용 차이 발생

4. **에러 처리**: Tool은 파일이 없거나 잘못된 형식일 때 예외 발생
   - AI가 에러 메시지를 받아 사용자에게 전달

5. **MIME 타입**: OpenAI Vision API는 특정 형식만 지원
   - 지원: PNG, JPG, JPEG, GIF, WEBP
   - 미지원: BMP, TIFF, SVG 등

## 🎓 다음 단계

- **Improve-01**: TUI Stream 출력 (실시간 응답 표시)
- **Improve-02**: MCP 연동 (Model Context Protocol)
- **Improve-03**: 비동기 Subagent (병렬 처리)
