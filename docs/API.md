# API 设计说明

## 1. 基本约定

- Base URL：`http://127.0.0.1:8787`
- Content-Type：`application/json`
- 鉴权方式：
  - `Authorization: Bearer <key>`
  - `X-API-Key: <key>`

### 错误响应格式

```json
{
  "error": {
    "message": "Missing API key.",
    "statusCode": 401
  }
}
```

## 2. 健康检查

### `GET /api/health`

返回服务可用性、认证模式、模型 provider、数据库路径和限流配置。

响应示例：

```json
{
  "ok": true,
  "auth": {
    "mode": "api-key",
    "enabled": true
  },
  "modelProvider": "deepseek",
  "modelName": "deepseek-chat",
  "modelBaseUrl": "https://api.deepseek.com/v1",
  "modelCompatibilityMode": "openai-chat-completions",
  "hasModelApiKey": true,
  "modelRetryConfig": {
    "maxRetries": 2,
    "retryBaseDelayMs": 300
  },
  "messageRateLimit": {
    "enabled": true,
    "maxRequests": 20,
    "windowMs": 60000
  },
  "dbPath": "data/teen-writing-coach.db"
}
```

## 3. 会话接口

### `POST /api/sessions`

创建写作会话。

请求示例：

```json
{
  "essayTitle": "难忘的一天",
  "gradeLevel": "grade-5"
}
```

响应示例：

```json
{
  "session": {
    "id": "2d8f3415-5a02-4c61-9ef8-c34f37a67fd1",
    "essayTitle": "难忘的一天",
    "essayDraft": "",
    "currentPhaseIndex": 1,
    "gradeLevel": "grade-5",
    "ownerUserId": "student-1",
    "messages": [
      {
        "role": "model",
        "content": "你好！我是你的写作教练..."
      }
    ],
    "createdAt": "2026-04-13T12:00:00.000Z",
    "updatedAt": "2026-04-13T12:00:00.000Z",
    "deletedAt": null
  }
}
```

### `GET /api/sessions`

列出会话。

查询参数：

- `q`
- `limit`
- `offset`
- `includeDeleted`
- `deletedOnly`
- `userId`

响应字段：

- `sessions`
- `pagination`
- `query`
- `filters`

### `GET /api/sessions/:sessionId`

读取单个会话。

查询参数：

- `includeDeleted=true`

### `PUT /api/sessions/:sessionId/draft`

保存草稿。

请求示例：

```json
{
  "essayDraft": "那是一个下着小雨的早晨……"
}
```

### `PATCH /api/sessions/:sessionId/phase`

更新当前阶段。

请求示例：

```json
{
  "currentPhaseIndex": 3
}
```

规则：

- 合法值范围是 `1` 到 `5`

### `POST /api/sessions/:sessionId/messages`

发送用户消息并触发模型调用。

请求示例：

```json
{
  "message": "我觉得题目里的关键词是“难忘”。"
}
```

响应示例：

```json
{
  "reply": "很好，那你能回忆一件最让你印象深刻的事情吗？",
  "session": {
    "id": "2d8f3415-5a02-4c61-9ef8-c34f37a67fd1",
    "essayTitle": "难忘的一天",
    "essayDraft": "",
    "currentPhaseIndex": 1,
    "gradeLevel": "grade-5",
    "ownerUserId": "student-1",
    "messages": [
      {
        "role": "model",
        "content": "你好！我是你的写作教练..."
      },
      {
        "role": "user",
        "content": "我觉得题目里的关键词是“难忘”。"
      },
      {
        "role": "model",
        "content": "很好，那你能回忆一件最让你印象深刻的事情吗？"
      }
    ],
    "createdAt": "2026-04-13T12:00:00.000Z",
    "updatedAt": "2026-04-13T12:05:00.000Z",
    "deletedAt": null
  }
}
```

限流响应头：

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
- `Retry-After`

### `DELETE /api/sessions/:sessionId`

软删除会话。

成功响应：

- `204 No Content`

### `POST /api/sessions/:sessionId/restore`

恢复已删除会话。

## 4. 模型日志与报表接口

### `GET /api/model-invocations`

查询模型调用日志。

查询参数：

- `limit`
- `offset`
- `sessionId`
- `status`
- `userId`
- `createdAfter`
- `createdBefore`

响应字段：

- `logs`
- `pagination`
- `filters`

日志字段：

- `provider`
- `modelName`
- `status`
- `attemptCount`
- `durationMs`
- `requestChars`
- `responseChars`
- `requestTokensEstimate`
- `responseTokensEstimate`
- `estimatedCost`
- `costCurrency`
- `errorMessage`
- `createdAt`

### `GET /api/reports/model-usage`

获取模型用量汇总报表。

查询参数：

- `sessionId`
- `status`
- `userId`
- `createdAfter`
- `createdBefore`

响应字段：

- `summary`
- `breakdown`
- `filters`

`summary` 主要字段：

- `totalCalls`
- `totalAttempts`
- `totalDurationMs`
- `totalRequestChars`
- `totalResponseChars`
- `totalRequestTokensEstimate`
- `totalResponseTokensEstimate`
- `totalEstimatedCost`
- `currencies`

## 5. 鉴权规则

- `AUTH_MODE=disabled` 时，不做登录鉴权，适合本地开发。
- `AUTH_MODE=api-key` 时，所有请求都必须带 key。
- 普通用户只能访问自己的会话、日志与报表。
- `role=admin` 的 key 可以查看全量数据。

## 6. 常见状态码

- `200`：读取或更新成功
- `201`：创建成功
- `204`：删除成功，无响应体
- `400`：请求参数错误
- `401`：未认证或 API key 缺失
- `403`：越权访问
- `404`：资源不存在
- `429`：触发限流
- `500`：服务端配置错误
- `502`：上游模型服务失败
- `503`：模型服务暂时不可用或未配置
