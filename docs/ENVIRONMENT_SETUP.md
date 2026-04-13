# 环境配置说明

## 1. 目标

本文档用于正式环境联调前的配置准备，覆盖前端、后端、模型服务、鉴权和运行依赖。

## 2. 推荐部署形态

- 前端：静态资源托管
- 后端：单实例 Node.js 服务
- 数据：单机 SQLite 文件
- 反向代理：Nginx 或云网关

当前阶段不建议一开始就上多实例，因为 SQLite 写入和本地持久化会增加联调复杂度。

## 3. 前端环境变量

### 必填

- `VITE_API_BASE_URL`
  示例：`https://your-domain.example.com/api`

### 条件必填

- `VITE_API_KEY`
  仅当后端启用 `AUTH_MODE=api-key` 时需要

## 4. 后端环境变量

### 基础运行

- `PORT`
- `HOST`
- `ALLOWED_ORIGIN`
- `SQLITE_DB_PATH`
- `SESSION_STORAGE_DIR`

### 鉴权

- `AUTH_MODE`
- `AUTH_API_KEYS_JSON`

推荐联调环境使用：

```env
AUTH_MODE="api-key"
AUTH_API_KEYS_JSON='[{"key":"student-dev-key","userId":"student-1","role":"user"},{"key":"admin-dev-key","userId":"admin","role":"admin"}]'
```

### 模型 provider

至少配置一组：

- OpenAI：
  - `MODEL_PROVIDER="openai"`
  - `OPENAI_API_KEY`
  - `MODEL_NAME`
- DeepSeek：
  - `MODEL_PROVIDER="deepseek"`
  - `DEEPSEEK_API_KEY`
  - `MODEL_NAME`
- OpenAI-Compatible：
  - `MODEL_PROVIDER="openai-compatible"`
  - `AI_API_KEY`
  - `AI_BASE_URL`
  - `MODEL_NAME`
- Gemini：
  - `MODEL_PROVIDER="gemini"`
  - `GEMINI_API_KEY`

### 模型治理

- `MODEL_MAX_RETRIES`
- `MODEL_RETRY_BASE_DELAY_MS`
- `MODEL_PRICING_JSON`

### 限流

- `MESSAGE_RATE_LIMIT_MAX_REQUESTS`
- `MESSAGE_RATE_LIMIT_WINDOW_MS`

联调建议值：

```env
MESSAGE_RATE_LIMIT_MAX_REQUESTS="20"
MESSAGE_RATE_LIMIT_WINDOW_MS="60000"
```

## 5. 正式环境联调前的最小配置集

### 前端

```env
VITE_API_BASE_URL="https://your-domain.example.com/api"
VITE_API_KEY="student-dev-key"
```

### 后端

```env
AUTH_MODE="api-key"
AUTH_API_KEYS_JSON='[{"key":"student-dev-key","userId":"student-1","role":"user"},{"key":"admin-dev-key","userId":"admin","role":"admin"}]'
MODEL_PROVIDER="deepseek"
DEEPSEEK_API_KEY="your_deepseek_api_key"
MODEL_NAME="deepseek-chat"
ALLOWED_ORIGIN="https://your-domain.example.com"
SQLITE_DB_PATH="data/teen-writing-coach.db"
MESSAGE_RATE_LIMIT_MAX_REQUESTS="20"
MESSAGE_RATE_LIMIT_WINDOW_MS="60000"
```

## 6. 联调前自检

- 前端 `VITE_API_BASE_URL` 指向线上或测试环境 API，而不是本地地址
- 后端 `ALLOWED_ORIGIN` 与前端域名一致
- 模型 key 仅配置在后端
- `SQLITE_DB_PATH` 指向持久化磁盘
- 前后端环境都已重启并加载最新变量

## 7. 常见配置问题

### 前端页面能打开，但发消息失败

重点检查：

- `VITE_API_BASE_URL` 是否正确
- 后端是否已启动
- `ALLOWED_ORIGIN` 是否允许当前域名
- `VITE_API_KEY` 和后端 `AUTH_API_KEYS_JSON` 是否匹配

### 后端健康检查正常，但模型调用失败

重点检查：

- provider 是否配置正确
- 模型 key 是否真实可用
- `MODEL_NAME` 是否存在
- 所在服务器是否能访问上游模型服务

### 会话能创建，但刷新后恢复失败

重点检查：

- 前端 localStorage 是否保留 sessionId
- 后端数据库文件是否持久化
- 会话是否被误删或软删除
