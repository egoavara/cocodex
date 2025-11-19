# Sample 00: Tool Loop의 핵심 개념

## 🎯 학습 목표

OpenAI Function Calling의 **Tool Loop 패턴**을 순수 OpenAI SDK로 구현하며 핵심 메커니즘을 이해합니다.

## 💡 Tool Loop란?

AI 에이전트의 핵심은 "자율적으로 도구를 사용하는 능력"입니다.

```
사용자: "파일을 쓰고, 읽어서 알려줘"
   ↓
[반복 1] AI 판단 → write_file 호출 필요
   ↓
Tool 실행 → "파일 쓰기 완료"
   ↓
[반복 2] AI 판단 → read_file 호출 필요  
   ↓
Tool 실행 → "파일 내용: Hello..."
   ↓
[반복 3] AI 판단 → 최종 응답 생성
   ↓
"파일에 작성하고 읽었습니다. 내용은..."
```

## 🔍 핵심 코드

### 1. Tool 정의 (JSON Schema)

```typescript
const tools = [{
  type: "function",
  function: {
    name: "read_file",
    description: "파일의 내용을 읽습니다",  // AI가 이걸 읽고 언제 사용할지 판단
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "파일 경로" }
      },
      required: ["path"]
    }
  }
}];
```

**핵심**: `description`이 매우 중요! AI가 이 설명만 보고 언제 이 함수를 써야 할지 판단합니다.

### 2. Tool Loop 구현

```typescript
while (iteration < MAX_ITERATIONS) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: messages,
    tools: tools,
  });

  const msg = response.choices[0].message;
  messages.push(msg);

  if (msg.tool_calls) {
    for (const toolCall of msg.tool_calls) {
      const result = await executeTool(toolCall.function.name, args);
      
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result,
      });
    }
    continue;
  }

  console.log(msg.content);
  break;
}
```

## 🚀 실행

```bash
npm run sample-00
```

## 🎓 다음

`npm run sample-01` - LangGraph로 구조화
