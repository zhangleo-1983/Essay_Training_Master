# 正式环境联调执行手册

## 1. 目标

本文档用于实际安排正式环境联调时的执行顺序。它不是说明性文档，而是按步骤执行的 runbook。

## 2. 使用前提

- 代码已固定到一个联调提交号
- 前端和后端部署地址已经确定
- 已拿到可用模型 provider 的真实 key
- 已准备学生联调 key 和管理员 key

推荐使用的代码版本：

- 当前已准备版本：`68ebe7c`

## 3. 配置模板

可直接参考以下模板文件：

- 前端模板：`templates/frontend.integration.env.example`
- 后端模板：`templates/backend.integration.env.example`

## 4. 执行顺序

### 步骤 1：确认代码版本

- 拉取目标分支
- 确认提交号一致
- 确认 README 和 docs 为最新版本

### 步骤 2：配置后端环境

- 复制后端模板
- 填写 `MODEL_PROVIDER`
- 填写真正可用的 provider key
- 填写 `ALLOWED_ORIGIN`
- 填写 `AUTH_API_KEYS_JSON`
- 确认 `SQLITE_DB_PATH` 指向可持久化目录

### 步骤 3：启动后端并检查健康状态

启动命令：

```bash
npm run dev:server
```

检查命令：

```bash
curl -i http://127.0.0.1:8787/api/health
```

必须确认：

- 返回 `200`
- `ok=true`
- `hasModelApiKey=true`
- `modelProvider` 与实际配置一致

### 步骤 4：配置前端环境

- 复制前端模板
- 将 `VITE_API_BASE_URL` 指向联调环境 API
- 如果后端启用 `api-key`，配置 `VITE_API_KEY`

### 步骤 5：启动前端

```bash
npm run dev
```

或将打包产物部署到联调域名：

```bash
npm run build
```

### 步骤 6：执行主链路联调

按顺序做以下动作：

1. 打开首页
2. 新建作文会话
3. 连续发送 3 轮消息
4. 在草稿区输入至少 100 字
5. 等待自动保存完成
6. 切换两个写作阶段
7. 刷新页面
8. 确认会话恢复
9. 返回会话列表
10. 重新打开历史作文
11. 删除会话
12. 恢复会话

### 步骤 7：执行后台检查

管理员需要确认：

- `/api/model-invocations` 能查到日志
- `/api/reports/model-usage` 能查到汇总
- SQLite 文件持续写入

### 步骤 8：记录问题

按以下格式记录：

- 问题标题
- 复现步骤
- 实际结果
- 期望结果
- 优先级：P0 / P1 / P2
- 是否阻塞联调继续

## 5. 联调通过标准

- 主链路全部通过
- 没有 P0 问题
- 没有数据丢失
- 没有跨域或鉴权阻塞
- 模型调用日志和用量报表可查

## 6. 联调完成后输出

联调结束后至少输出：

- 实际使用环境域名
- 实际使用 provider 和 model
- 通过项
- 未通过项
- 阻塞问题
- 下一步开发建议
