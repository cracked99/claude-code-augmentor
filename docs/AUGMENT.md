# Claude Code Augment

**claude-code-augment** is an extension to Claude Code Router that intercepts official Claude Code requests, augments them by inserting modified system prompts, additional instructions, and contextual data, then forwards the modified request to OpenRouter.

## Overview

```
┌─────────────────┐     ┌────────────────────────────────────────────┐     ┌─────────────────┐
│  Claude Code    │────▶│  Claude Code Augment (localhost:3456)      │────▶│  OpenRouter     │
│  CLI            │◀────│                                            │◀────│  API            │
│                 │     │  ┌────────────────────────────────────────┐│     │                 │
└─────────────────┘     │  │ 1. Detect Claude Code Request          ││     └─────────────────┘
                        │  │ 2. Validate Augmentation Config        ││
                        │  │ 3. Replace/Prepend System Prompt       ││
                        │  │ 4. Insert Additional Instructions      ││
                        │  │ 5. Attach Extra Context                ││
                        │  │ 6. Forward to OpenRouter               ││
                        │  │ 7. Transform Response                  ││
                        │  └────────────────────────────────────────┘│
                        └────────────────────────────────────────────┘
```

## Features

- **Request Detection**: Identify Claude Code requests via header fields or metadata flags
- **System Prompt Modification**: Replace or prepend the original system prompt
- **Additional Instructions**: Insert ordered instruction messages after the system prompt
- **Extra Context Injection**: Attach structured JSON context to requests
- **Message Preservation**: Maintain original user/assistant message ordering
- **OpenRouter Integration**: Forward augmented requests with proper authentication
- **Error Handling**: Comprehensive error responses (400, 502, passthrough)

## Configuration

Add the `Augment` section to your `config.json`:

```json
{
  "Augment": {
    "enabled": true,
    "modified_system_prompt": "You are an enhanced AI coding assistant...",
    "additional_instructions": [
      "Always include error handling in code.",
      "Prefer functional programming patterns."
    ],
    "extra_context": {
      "project": {
        "name": "my-app",
        "framework": "next.js"
      },
      "preferences": {
        "testing": "jest",
        "styling": "tailwindcss"
      }
    },
    "openrouter_endpoint": "https://openrouter.ai/api/v1/chat/completions",
    "openrouter_auth": "$OPENROUTER_API_KEY",
    "detection": {
      "header_field": "x-agent",
      "header_value": "claude-code",
      "metadata_field": "agent",
      "metadata_value": "claude-code"
    }
  }
}
```

## Configuration Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `enabled` | boolean | Yes | Enable/disable augmentation |
| `modified_system_prompt` | string | No | Custom system prompt to replace/prepend original |
| `additional_instructions` | string[] | No | Ordered list of instruction messages to insert |
| `extra_context` | object | No | Structured JSON context to include in requests |
| `openrouter_endpoint` | string | Yes* | OpenRouter API endpoint URL |
| `openrouter_auth` | string | Yes* | OpenRouter authentication token |
| `detection.header_field` | string | No | HTTP header field to check for Claude Code |
| `detection.header_value` | string | No | Expected header value (optional) |
| `detection.metadata_field` | string | No | Request metadata field to check |
| `detection.metadata_value` | string | No | Expected metadata value (optional) |

*Required when `enabled` is `true`

## Request Detection

The augmentation triggers when a request matches **either**:

1. **Header Detection**: The specified header field exists with the expected value
   ```
   X-Agent: claude-code
   ```

2. **Metadata Detection**: The request body contains matching metadata
   ```json
   {
     "metadata": {
       "agent": "claude-code"
     }
   }
   ```

If neither criterion matches, the request passes through unchanged.

## Augmentation Process

### 1. System Prompt Modification

When `modified_system_prompt` is provided:
- Replaces the original system prompt entirely

When `modified_system_prompt` is not provided:
- Preserves the original system prompt

### 2. Additional Instructions

Instructions are inserted **in order** after the system prompt:

```
Original: [system prompt] -> [user messages]
Augmented: [system prompt] -> [instruction 1] -> [instruction 2] -> [user messages]
```

### 3. Extra Context

Context is wrapped in `<context>` tags and inserted as a system message:

```
<context>
{
  "project": "my-app",
  "framework": "next.js"
}
</context>
```

### 4. Message Preservation

- User message content is **never modified**
- Assistant message content is **never modified**
- Original message order is **always preserved**

## Error Handling

| Error Code | Condition | Response |
|------------|-----------|----------|
| 400 | Missing/invalid augmentation parameters | `invalid_request_error` |
| 502 | Network error reaching OpenRouter | `api_error` with description |
| 4xx/5xx | OpenRouter error | Propagated error code and message |

### Error Response Format

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Missing required parameter: openrouter_auth"
  }
}
```

## OpenRouter Request Format

The augmented request conforms to OpenRouter's expected schema:

```json
{
  "model": "gpt-4",
  "messages": [
    {"role": "system", "content": "Modified system prompt"},
    {"role": "system", "content": "Additional instruction 1"},
    {"role": "system", "content": "<context>...</context>"},
    {"role": "user", "content": "Original user message"},
    {"role": "assistant", "content": "Original assistant response"},
    {"role": "user", "content": "Latest user message"}
  ],
  "max_tokens": 4096,
  "stream": true
}
```

## Streaming Support

Both streaming and non-streaming responses are supported:

- **Streaming**: OpenRouter SSE events are transformed to Anthropic format
- **Non-streaming**: JSON response is converted to Anthropic message format

## Usage Example

### 1. Install

```bash
npm install -g @musistudio/claude-code-augment
```

### 2. Configure

Create `~/.claude-code-router/config.json`:

```json
{
  "Augment": {
    "enabled": true,
    "modified_system_prompt": "You are an expert coding assistant.",
    "additional_instructions": [
      "Always write TypeScript.",
      "Include JSDoc comments."
    ],
    "extra_context": {
      "project": "my-web-app"
    },
    "openrouter_endpoint": "https://openrouter.ai/api/v1/chat/completions",
    "openrouter_auth": "sk-or-v1-your-key"
  },
  "Providers": [...],
  "Router": {...}
}
```

### 3. Start

```bash
ccr start
```

### 4. Use Claude Code

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3456"
claude
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Architecture

```
src/augment/
├── types.ts          # TypeScript interfaces
├── detector.ts       # Claude Code request detection
├── augmenter.ts      # Request augmentation logic
├── forwarder.ts      # OpenRouter forwarding and response transformation
├── middleware.ts     # Fastify middleware integration
├── index.ts          # Module exports
└── __tests__/        # Test suites
    ├── detector.test.ts
    ├── augmenter.test.ts
    ├── forwarder.test.ts
    └── integration.test.ts
```

## Non-Functional Requirements

- **Minimal Latency**: Augmentation adds < 1ms overhead
- **Logging**: Only routing/augmentation events logged (no sensitive data)
- **Thread Safety**: Stateless design for concurrent request handling

## Acceptance Criteria

✅ Claude Code requests with valid augmentation produce properly formatted OpenRouter requests  
✅ Non-Claude requests pass through unchanged  
✅ Modified system prompt replaces/prepends original  
✅ Additional instructions inserted in order  
✅ Extra context included in request  
✅ Original conversation preserved in order  
✅ OpenRouter responses returned to caller  
✅ Error codes properly propagated (400, 502, etc.)
