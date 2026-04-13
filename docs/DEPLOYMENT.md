# 部署与运维说明

## 1. 部署目标

当前目标是支撑开发环境与小规模试用环境，不直接宣称已具备完整生产级高可用部署能力。

## 2. 运行依赖

- Node.js 24+
- npm
- 可访问所选模型 provider 的网络环境

## 3. 关键环境变量

### 认证

- `AUTH_MODE`
- `AUTH_API_KEYS_JSON`

### 模型接入

- `MODEL_PROVIDER`
- `MODEL_NAME`
- `AI_API_KEY`
- `AI_BASE_URL`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL`
- `DEEPSEEK_BASE_URL`

### 模型治理

- `MODEL_MAX_RETRIES`
- `MODEL_RETRY_BASE_DELAY_MS`
- `MODEL_PRICING_JSON`

### 服务运行

- `PORT`
- `HOST`
- `ALLOWED_ORIGIN`
- `SQLITE_DB_PATH`
- `SESSION_STORAGE_DIR`
- `MESSAGE_RATE_LIMIT_MAX_REQUESTS`
- `MESSAGE_RATE_LIMIT_WINDOW_MS`

## 4. 本地开发部署

### 4.1 安装依赖

```bash
npm install
```

### 4.2 启动前端

```bash
npm run dev
```

### 4.3 启动后端

```bash
npm run dev:server
```

## 5. 推荐试用环境部署方式

适合当前阶段的推荐方式：

- 前端：静态资源托管
- 后端：单实例 Node 服务
- 数据：本机或挂载磁盘上的 SQLite 文件
- 反向代理：Nginx 或云厂商网关

## 6. 反向代理建议

- 前端静态资源和后端 API 分开部署
- 通过 `/api/*` 反向代理到 Node 服务
- 对外只暴露 HTTPS
- 通过反向代理限制来源域名和请求体大小

## 7. 运维检查项

- 模型密钥仅存放于服务端环境变量
- 禁止将 `.env` 提交到仓库
- 数据库目录具备持久化能力
- 配置 `ALLOWED_ORIGIN`
- 按环境设置不同 API key
- 为管理员 key 和普通用户 key 做分离

## 8. 监控与日志

当前已具备：

- 应用启动日志
- 模型调用日志表
- 基础错误返回

当前仍缺失：

- 结构化应用日志
- 性能指标采集
- 错误告警
- 审计日志导出

## 9. 备份与恢复

当前最低要求：

- 定期备份 `data/teen-writing-coach.db`
- 备份前确认 SQLite 文件处于一致状态
- 保留最近多份版本

后续建议：

- 使用 PostgreSQL 后接入自动备份与恢复演练

## 10. 生产化前必须完成的事项

- 前端正式接入后端 API
- 正式用户登录体系
- 数据库从 SQLite 升级到 PostgreSQL
- Redis 限流与缓存
- 结构化日志与监控告警
- 内容安全与审计策略
