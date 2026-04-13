# 青少年写作教练 (Teen Writing Coach)

这是一个专为9-16岁青少年设计的“引导式写作教练” Web 应用程序。它通过可配置的大语言模型服务端网关，以苏格拉底式提问启发学生思考，帮助他们建立写作逻辑，最终达到脱离 AI 也能独立写作的能力。

## 文档导航

- [PRD](./docs/PRD.md)
- [技术架构说明](./docs/ARCHITECTURE.md)
- [API 设计说明](./docs/API.md)
- [数据库设计说明](./docs/DATABASE.md)
- [部署与运维说明](./docs/DEPLOYMENT.md)
- [后续规划](./docs/ROADMAP.md)

## 🌟 核心教育理念

本项目严格遵循**“授人以渔”**（Scaffolding 脚手架教学法）的原则：
- **拒绝代写**：Agent 绝对不会直接替学生写出完整的段落或文章。
- **启发式提问**：每次只抛出一个问题，引导学生一步步深入思考。
- **提供脚手架**：当学生遇到困难时，提供思考方向的提示，而不是直接给答案。

## ✨ 主要功能

- **双屏协同工作区 (Split-Screen Workspace)**：
  - **左侧（教练辅导区）**：与 AI 教练进行对话，获取写作灵感和指导。
  - **右侧（我的草稿本）**：专属的写作区域，学生可以将讨论出的灵感、提纲和段落记录在这里。
- **五步引导法 (The 5-Step Process)**：
  1. **审题立意**：分析题目关键词，明确中心思想。
  2. **选材构思**：发散思维，挑选最能表达中心思想的素材。
  3. **谋篇布局**：安排文章结构（开头、中间、结尾）。
  4. **起草成文**：动笔写具体段落，关注细节描写。
  5. **修改润色**：检查草稿，修改语病，提升文采。

## 🛠️ 技术栈

- **前端框架**: React 19 + Vite
- **后端框架**: Express
- **样式**: Tailwind CSS
- **图标**: Lucide React
- **Markdown 渲染**: React Markdown
- **AI 接入**: 服务端多模型网关，支持 Gemini、OpenAI、DeepSeek 和 OpenAI 兼容接口

## 🚀 本地运行指南

如果您已经将代码下载到本地，请按照以下步骤运行项目：

### 1. 环境准备
请确保您的电脑上已安装 [Node.js](https://nodejs.org/) (建议版本 24+，已按当前内置 SQLite 方案验证)。

### 2. 安装依赖
在项目根目录下打开终端，运行以下命令安装所需的依赖包：
```bash
npm install
```

### 3. 配置环境变量
1. 在项目根目录下找到 `.env.example` 文件。
2. 复制该文件并重命名为 `.env`。
3. 前端通过后端 API 工作，请先配置前端 API 地址：
```env
VITE_API_BASE_URL="http://127.0.0.1:8787/api"
```

如果后端启用了 `AUTH_MODE=api-key`，前端本地开发还需要配置：
```env
VITE_API_KEY="你的本地开发 API Key"
```

4. 根据您要接入的模型服务，在 `.env` 文件中填写对应 provider 配置。例如：
```env
MODEL_PROVIDER="deepseek"
DEEPSEEK_API_KEY="你的_DEEPSEEK_API_KEY"
MODEL_NAME="deepseek-chat"
```

如果使用 OpenAI 兼容接口，也可以这样配置：
```env
MODEL_PROVIDER="openai-compatible"
AI_API_KEY="你的_API_KEY"
AI_BASE_URL="https://your-api-base.example.com/v1"
MODEL_NAME="your-model-name"
```

### 4. 启动开发服务器
运行以下命令启动本地开发服务器：
```bash
npm run dev
```
启动成功后，在浏览器中访问终端输出的本地地址（通常是 `http://localhost:3000` 或 `http://localhost:5173`）即可体验应用。

### 5. 启动后端 API 服务
项目现在包含一个独立的后端服务，负责：
- 服务端保存模型 API Key
- 创建和持久化写作会话
- 保存草稿和当前写作阶段
- 代理多模型对话请求

运行以下命令启动后端：
```bash
npm run dev:server
```

默认地址：
```text
http://127.0.0.1:8787
```

## 🔌 后端接口

- `GET /api/health`: 健康检查与服务端配置状态
- `GET /api/model-invocations`: 查看模型调用日志，支持 `sessionId`、`status`、`createdAfter`、`createdBefore`、`limit`、`offset`
- `GET /api/reports/model-usage`: 查看 provider / model 用量与成本汇总，支持 `sessionId`、`status`、`createdAfter`、`createdBefore`
- `POST /api/sessions`: 创建写作会话
- `GET /api/sessions`: 列出会话，支持 `q`、`limit`、`offset`、`includeDeleted`、`deletedOnly`
- `GET /api/sessions/:sessionId`: 读取写作会话，支持 `includeDeleted=true`
- `PUT /api/sessions/:sessionId/draft`: 保存草稿
- `PATCH /api/sessions/:sessionId/phase`: 更新当前写作阶段
- `POST /api/sessions/:sessionId/messages`: 代理模型对话
- `DELETE /api/sessions/:sessionId`: 软删除会话
- `POST /api/sessions/:sessionId/restore`: 恢复已删除会话

## 🤖 模型配置

当前产品架构以服务端多模型接入为准，不再将 Google AI 作为唯一基础设施；Gemini 现在只是兼容 provider 之一。

后端目前支持以下模型接入方式：

- `MODEL_PROVIDER=openai`
  走 OpenAI Chat Completions 协议，读取 `AI_API_KEY` 或 `OPENAI_API_KEY`
- `MODEL_PROVIDER=deepseek`
  走 OpenAI 兼容协议，读取 `AI_API_KEY` 或 `DEEPSEEK_API_KEY`
- `MODEL_PROVIDER=openai-compatible`
  走 OpenAI 兼容协议，读取 `AI_API_KEY`、`AI_BASE_URL` 与 `MODEL_NAME`
- `MODEL_PROVIDER=gemini`
  作为兼容选项保留，使用 Google Gemini SDK，读取 `AI_API_KEY` 或 `GEMINI_API_KEY`

推荐做法：

- OpenAI:
  `MODEL_PROVIDER=openai`
  `OPENAI_API_KEY=...`
  `MODEL_NAME=...`
- DeepSeek:
  `MODEL_PROVIDER=deepseek`
  `DEEPSEEK_API_KEY=...`
  `MODEL_NAME=...`
- 其他兼容 OpenAI 协议的模型服务:
  `MODEL_PROVIDER=openai-compatible`
  `AI_API_KEY=...`
  `AI_BASE_URL=...`
  `MODEL_NAME=...`
- Gemini:
  `MODEL_PROVIDER=gemini`
  `GEMINI_API_KEY=...`

重试配置：

- `MODEL_MAX_RETRIES`
  上游失败后的最大重试次数，默认 `2`
- `MODEL_RETRY_BASE_DELAY_MS`
  指数退避的起始延迟，默认 `300`

如果要统计估算成本，可以配置：

- `MODEL_PRICING_JSON`
  用 `provider:model` 作为 key，配置输入/输出单价

## 🧾 调用日志与限流

- 每次真正进入模型调用的请求，都会写入 SQLite `model_invocations` 日志表
- 日志记录包含用户、provider、model、成功/失败状态、尝试次数、耗时、请求字数、响应字数、估算 token、估算成本、错误信息
- `POST /api/sessions/:sessionId/messages` 现在默认启用 SQLite 限流
- 预期内的 provider 配置错误或上游错误会降级为单行 `warn`，避免服务端日志被完整堆栈刷屏

默认限流配置：

- `MESSAGE_RATE_LIMIT_MAX_REQUESTS=20`
- `MESSAGE_RATE_LIMIT_WINDOW_MS=60000`

超过限制时，接口会返回 `429`，并带上 `Retry-After` 与基础限流响应头

所有会话数据默认保存到 SQLite 文件：
```text
data/teen-writing-coach.db
```

如果历史上已经存在 `data/sessions/*.json`，服务启动时会自动尝试导入。
删除会话时默认执行软删除，数据仍保留在 SQLite 中，可通过恢复接口找回。

## 🔐 认证与用户隔离

- `AUTH_MODE=disabled`
  后端不做认证，兼容本地单人开发
- `AUTH_MODE=api-key`
  后端要求 `Authorization: Bearer <key>` 或 `X-API-Key`

启用 `api-key` 模式后：

- 创建的会话会绑定到 `userId`
- 普通用户只能访问自己的会话、日志和报表
- `role=admin` 的 key 可以查看全部数据

## 📁 项目结构说明

- `/src/App.tsx`: 应用程序的主组件，包含学生单人版 MVP 的页面流程、会话恢复、自动保存和错误处理。
- `/src/api.ts`: 前端 API 访问层，负责调用后端会话与消息接口。
- `/src/main.tsx`: React 应用的入口文件。
- `/src/index.css`: 全局样式文件，引入了 Tailwind CSS。
- `/backend/server.js`: 独立后端服务，处理会话、草稿、认证、限流和多模型 API 代理。
- `/metadata.json`: AI Studio 项目的元数据配置。
- `/.env.example`: 环境变量示例文件。

## 🤝 扩展建议

如果您希望继续完善这个项目，可以考虑添加以下功能：
1. **用户系统**：添加登录注册功能，保存不同学生的写作记录。
2. **历史记录**：将右侧的“草稿本”内容持久化保存到数据库中。
3. **难度自适应**：根据学生的年级（如小学、初中）动态调整 AI 教练的词汇难度和提问深度。
4. **语音交互**：接入语音识别和合成，让交互更加自然。
