# 数据库设计说明

## 1. 数据库选型

- 当前数据库：SQLite
- 访问方式：Node `node:sqlite`
- 适用范围：本地开发、单机部署、小规模试用

## 2. 表结构

### 2.1 `sessions`

用途：保存作文写作会话主数据。

字段：

- `id` `TEXT PRIMARY KEY`
- `essay_title` `TEXT NOT NULL`
- `essay_draft` `TEXT NOT NULL DEFAULT ''`
- `current_phase_index` `INTEGER NOT NULL`
- `grade_level` `TEXT`
- `owner_user_id` `TEXT`
- `messages_json` `TEXT NOT NULL`
- `created_at` `TEXT NOT NULL`
- `updated_at` `TEXT NOT NULL`
- `deleted_at` `TEXT`

说明：

- `messages_json` 以 JSON 数组保存完整会话消息
- `deleted_at` 非空表示会话已软删除

### 2.2 `model_invocations`

用途：记录每一次真正进入模型调用的日志。

字段：

- `id` `INTEGER PRIMARY KEY AUTOINCREMENT`
- `session_id` `TEXT`
- `user_id` `TEXT`
- `provider` `TEXT NOT NULL`
- `model_name` `TEXT`
- `status` `TEXT NOT NULL`
- `attempt_count` `INTEGER NOT NULL`
- `duration_ms` `INTEGER NOT NULL`
- `request_chars` `INTEGER NOT NULL`
- `response_chars` `INTEGER NOT NULL`
- `request_tokens_estimate` `INTEGER NOT NULL DEFAULT 0`
- `response_tokens_estimate` `INTEGER NOT NULL DEFAULT 0`
- `estimated_cost` `REAL`
- `cost_currency` `TEXT`
- `error_message` `TEXT`
- `created_at` `TEXT NOT NULL`

说明：

- `status` 当前主要包含 `success` 和 `error`
- token 与成本为估算值，不是 provider 官方账单值

### 2.3 `rate_limit_events`

用途：实现 SQLite 跨进程限流。

字段：

- `id` `INTEGER PRIMARY KEY AUTOINCREMENT`
- `bucket_key` `TEXT NOT NULL`
- `created_at_ms` `INTEGER NOT NULL`

说明：

- `bucket_key` 可以是 `user:<userId>` 或 `ip:<ip>`
- 通过时间窗口内计数判断是否限流

## 3. 索引设计

### `sessions`

- `idx_sessions_updated_at`
- `idx_sessions_deleted_at`
- `idx_sessions_owner_user_id`

### `model_invocations`

- `idx_model_invocations_created_at`
- `idx_model_invocations_session_id`
- `idx_model_invocations_user_id`

### `rate_limit_events`

- `idx_rate_limit_events_bucket_key`

## 4. 数据生命周期

### 会话

- 创建会话时写入 `sessions`
- 修改草稿、阶段、消息时更新同一条记录
- 删除时执行软删除，不直接物理删除
- 恢复时清空 `deleted_at`

### 模型日志

- 每次进入模型调用时记录一条日志
- 成功和失败都会记录
- 当前没有自动归档与清理策略

### 限流事件

- 每次消息请求都会记录限流事件
- 在新请求进入时清理过期窗口外数据

## 5. 历史数据兼容

- 若存在 `data/sessions/*.json`
- 服务启动时会自动导入到 SQLite
- 已导入数据以 `id` 去重

## 6. 当前设计问题

- `messages_json` 不利于后续做消息级分页和检索
- SQLite 不适合多实例并发写入
- 目前缺少数据库迁移版本管理工具
- 当前没有正式备份策略和归档策略

## 7. 演进建议

- 从 `messages_json` 迁移到独立 `session_messages` 表
- 增加 `users`、`assignments`、`essay_feedback`、`rubric_results` 等业务表
- 从 SQLite 升级到 PostgreSQL
- 引入数据库迁移工具与数据备份流程
