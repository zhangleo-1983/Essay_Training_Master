import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';
import { createAuthManager } from './auth.js';
import { initializeDatabase, resolveDataPaths } from './database.js';
import { createModelGateway } from './model-gateway.js';
import { createUsageMetricsCalculator } from './usage-metrics.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const dataPaths = resolveDataPaths(projectRoot);
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const database = await initializeDatabase(dataPaths);
const importedLegacySessions = await database.importLegacyJsonSessions();
const modelGateway = createModelGateway();
const usageMetrics = createUsageMetricsCalculator();
const authManager = createAuthManager();
const messageRateLimitConfig = {
  maxRequests: Number(process.env.MESSAGE_RATE_LIMIT_MAX_REQUESTS || 20),
  windowMs: Number(process.env.MESSAGE_RATE_LIMIT_WINDOW_MS || 60_000),
};

const PHASES = [
  { id: 'setup', name: '设定题目' },
  { id: 'analysis', name: '审题立意' },
  { id: 'brainstorm', name: '选材构思' },
  { id: 'outline', name: '谋篇布局' },
  { id: 'draft', name: '起草成文' },
  { id: 'review', name: '修改润色' },
];

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
}

function setRateLimitHeaders(res, result) {
  if (!Number.isFinite(messageRateLimitConfig.maxRequests) || messageRateLimitConfig.maxRequests <= 0) {
    return;
  }

  res.setHeader('X-RateLimit-Limit', String(result.limit));
  res.setHeader('X-RateLimit-Remaining', String(result.remaining));
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(result.resetAt / 1000)));
  if (!result.allowed) {
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))));
  }
}

function getRateLimitBucketKey(req) {
  if (req.auth?.userId) {
    return `user:${req.auth.userId}`;
  }

  return `ip:${req.ip}`;
}

function createInitialCoachMessage(essayTitle) {
  return `你好！我是你的写作教练。今天我们要挑战的题目是《${essayTitle}》。\n\n我们先从第一步“审题立意”开始吧！看到这个题目，你觉得最核心的词（题眼）是哪几个？你想通过这篇文章表达什么情感或道理呢？`;
}

function getSystemPrompt(phaseId, title) {
  const phaseName = PHASES.find((phase) => phase.id === phaseId)?.name || '写作训练';
  const basePrompt = `你是一个专门为9-16岁青少年设计的“引导式写作教练”。你的核心任务是：通过苏格拉底式提问启发学生思考，帮助他们建立写作逻辑。
绝对禁止：直接替学生写出完整的段落或文章。
交互原则：
1. 每次只问一个启发式问题，不要一次性抛出多个问题。
2. 语气要亲切、鼓励、符合青少年的认知水平。
3. 如果学生回答不知道，给出2-3个思考方向的提示（脚手架），而不是直接给答案。
4. 引导学生将讨论的结果写在“我的草稿”中。
5. 严格遵守当前阶段的任务，如果当前阶段目标达成，提示学生进入下一阶段。

当前学生的作文题目是：《${title}》
当前处于写作的【${phaseName}】阶段。
`;

  const phaseInstructions = {
    analysis: '此阶段目标：引导学生分析题目中的关键词，明确文章中心思想。',
    brainstorm: '此阶段目标：引导学生回忆真实经历或素材，挑选最能表达中心思想的材料。',
    outline: '此阶段目标：引导学生安排文章结构，明确开头、中间、结尾。',
    draft: '此阶段目标：鼓励学生开始动笔写具体段落，关注动作、语言、心理等细节描写。',
    review: '此阶段目标：引导学生检查草稿是否通顺、准确，并提升细节和表达。',
  };

  return `${basePrompt}\n${phaseInstructions[phaseId] || ''}`;
}

function buildSessionResponse(session) {
  return {
    id: session.id,
    essayTitle: session.essayTitle,
    essayDraft: session.essayDraft,
    currentPhaseIndex: session.currentPhaseIndex,
    gradeLevel: session.gradeLevel,
    ownerUserId: session.ownerUserId || null,
    messages: session.messages,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    deletedAt: session.deletedAt || null,
  };
}

function createSession({ essayTitle, gradeLevel }) {
  const now = new Date().toISOString();
  const title = essayTitle?.trim();

  if (!title) {
    const error = new Error('essayTitle is required.');
    error.statusCode = 400;
    throw error;
  }

  return {
    id: crypto.randomUUID(),
    essayTitle: title,
    essayDraft: '',
    currentPhaseIndex: 1,
    gradeLevel: gradeLevel?.trim() || null,
    ownerUserId: null,
    messages: [
      {
        role: 'model',
        content: createInitialCoachMessage(title),
      },
    ],
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

function enforceSessionAccess(req, session) {
  if (!authManager.enabled) {
    return;
  }

  if (!authManager.canAccessOwner(req.auth, session.ownerUserId)) {
    const error = new Error('Forbidden.');
    error.statusCode = 403;
    throw error;
  }
}

function readAuthorizedSession(req, sessionId, options = {}) {
  const session = database.readSession(sessionId, options);
  enforceSessionAccess(req, session);
  return session;
}

function isExpectedServerError(error) {
  if (!error || typeof error.statusCode !== 'number' || error.statusCode < 500) {
    return false;
  }

  const message = String(error.message || '');
  return (
    /API key is not configured/.test(message) ||
    message.startsWith('Upstream ') ||
    error.statusCode === 502 ||
    error.statusCode === 503
  );
}

async function generateCoachReply(session, userMessage) {
  const currentPhase = PHASES[session.currentPhaseIndex];
  const systemInstruction = getSystemPrompt(
    currentPhase?.id || 'analysis',
    session.essayTitle,
  );

  return modelGateway.generateReply({
    systemInstruction,
    conversation: [
      ...session.messages.map((message) => ({
        role: message.role === 'model' ? 'assistant' : message.role,
        content: message.content,
      })),
      {
        role: 'user',
        content: userMessage,
      },
    ],
    temperature: 0.7,
  });
}

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  withCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  next();
});
app.use((req, _res, next) => {
  try {
    req.auth = authManager.authenticateRequest(req);
    next();
  } catch (error) {
    next(error);
  }
});

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      auth: {
        mode: authManager.mode,
        enabled: authManager.enabled,
      },
      modelProvider: modelGateway.provider,
      modelName: modelGateway.modelName,
      modelBaseUrl: modelGateway.baseUrl,
      modelCompatibilityMode: modelGateway.compatibilityMode,
      hasModelApiKey: modelGateway.hasApiKey,
      modelRetryConfig: {
        maxRetries: modelGateway.maxRetries,
        retryBaseDelayMs: modelGateway.retryBaseDelayMs,
      },
      messageRateLimit: {
        enabled: messageRateLimitConfig.maxRequests > 0,
        maxRequests: messageRateLimitConfig.maxRequests,
        windowMs: messageRateLimitConfig.windowMs,
      },
      dbPath: dataPaths.dbPath,
      legacySessionDir: dataPaths.legacySessionDir,
      importedLegacySessions,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/model-invocations', async (req, res, next) => {
  try {
    const result = database.listModelInvocations({
      limit: req.query.limit,
      offset: req.query.offset,
      sessionId: req.query.sessionId,
      status: req.query.status,
      createdAfter: req.query.createdAfter,
      createdBefore: req.query.createdBefore,
      userId:
        authManager.enabled && req.auth.role !== 'admin'
          ? req.auth.userId
          : req.query.userId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/reports/model-usage', async (req, res, next) => {
  try {
    const result = database.getModelUsageReport({
      sessionId: req.query.sessionId,
      status: req.query.status,
      createdAfter: req.query.createdAfter,
      createdBefore: req.query.createdBefore,
      userId:
        authManager.enabled && req.auth.role !== 'admin'
          ? req.auth.userId
          : req.query.userId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions', async (req, res, next) => {
  try {
    const session = createSession(req.body || {});
    session.ownerUserId = req.auth.userId;
    database.createSession(session);
    res.status(201).json({ session: buildSessionResponse(session) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions', async (req, res, next) => {
  try {
    const result = database.listSessions({
      q: req.query.q,
      limit: req.query.limit,
      offset: req.query.offset,
      includeDeleted: req.query.includeDeleted,
      deletedOnly: req.query.deletedOnly,
      ownerUserId:
        authManager.enabled && req.auth.role !== 'admin'
          ? req.auth.userId
          : typeof req.query.userId === 'string'
            ? req.query.userId
            : undefined,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/sessions/:sessionId', async (req, res, next) => {
  try {
    const session = readAuthorizedSession(req, req.params.sessionId, {
      includeDeleted: req.query.includeDeleted === 'true',
    });
    res.json({ session: buildSessionResponse(session) });
  } catch (error) {
    next(error);
  }
});

app.put('/api/sessions/:sessionId/draft', async (req, res, next) => {
  try {
    const session = readAuthorizedSession(req, req.params.sessionId);
    session.essayDraft = typeof req.body?.essayDraft === 'string' ? req.body.essayDraft : '';
    session.updatedAt = new Date().toISOString();
    database.saveSession(session);
    res.json({ session: buildSessionResponse(session) });
  } catch (error) {
    next(error);
  }
});

app.patch('/api/sessions/:sessionId/phase', async (req, res, next) => {
  try {
    const phaseIndex = Number(req.body?.currentPhaseIndex);
    if (!Number.isInteger(phaseIndex) || phaseIndex < 1 || phaseIndex >= PHASES.length) {
      const error = new Error('currentPhaseIndex must be an integer between 1 and 5.');
      error.statusCode = 400;
      throw error;
    }

    const session = readAuthorizedSession(req, req.params.sessionId);
    session.currentPhaseIndex = phaseIndex;
    session.updatedAt = new Date().toISOString();
    database.saveSession(session);
    res.json({ session: buildSessionResponse(session) });
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const userMessage = req.body?.message?.trim();
    if (!userMessage) {
      const error = new Error('message is required.');
      error.statusCode = 400;
      throw error;
    }

    const rateLimit = database.consumeRateLimit({
      bucketKey: getRateLimitBucketKey(req),
      maxRequests: messageRateLimitConfig.maxRequests,
      windowMs: messageRateLimitConfig.windowMs,
    });
    setRateLimitHeaders(res, rateLimit);
    if (!rateLimit.allowed) {
      const error = new Error('Too many message requests. Please try again later.');
      error.statusCode = 429;
      throw error;
    }

    const session = readAuthorizedSession(req, req.params.sessionId);
    session.messages.push({ role: 'user', content: userMessage });
    const startedAt = Date.now();
    let reply = '';
    let attemptsUsed = 1;
    let status = 'success';
    let errorMessage = null;

    try {
      const modelResult = await generateCoachReply(session, userMessage);
      reply = modelResult.text;
      attemptsUsed = modelResult.attemptsUsed;
    } catch (error) {
      status = 'error';
      attemptsUsed = error?.attemptsUsed || 1;
      errorMessage = error?.message || 'Model invocation failed.';
      database.createModelInvocation({
        sessionId: session.id,
        userId: req.auth.userId,
        provider: modelGateway.provider,
        modelName: modelGateway.modelName,
        status,
        attemptCount: attemptsUsed,
        durationMs: Date.now() - startedAt,
        requestChars: userMessage.length,
        responseChars: 0,
        ...usageMetrics.calculate({
          provider: modelGateway.provider,
          modelName: modelGateway.modelName,
          requestChars: userMessage.length,
          responseChars: 0,
        }),
        errorMessage,
      });
      throw error;
    }

    session.messages.push({ role: 'model', content: reply });
    session.updatedAt = new Date().toISOString();
    database.saveSession(session);
    database.createModelInvocation({
      sessionId: session.id,
      userId: req.auth.userId,
      provider: modelGateway.provider,
      modelName: modelGateway.modelName,
      status,
      attemptCount: attemptsUsed,
      durationMs: Date.now() - startedAt,
      requestChars: userMessage.length,
      responseChars: reply.length,
      ...usageMetrics.calculate({
        provider: modelGateway.provider,
        modelName: modelGateway.modelName,
        requestChars: userMessage.length,
        responseChars: reply.length,
      }),
      errorMessage,
    });

    res.status(201).json({
      reply,
      session: buildSessionResponse(session),
    });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/sessions/:sessionId', async (req, res, next) => {
  try {
    const session = readAuthorizedSession(req, req.params.sessionId, {
      includeDeleted: true,
    });
    database.softDeleteSession(session.id);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post('/api/sessions/:sessionId/restore', async (req, res, next) => {
  try {
    const existing = readAuthorizedSession(req, req.params.sessionId, {
      includeDeleted: true,
    });
    const session = database.restoreSession(existing.id);
    res.json({ session: buildSessionResponse(session) });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const statusCode = error?.statusCode || 500;
  const message = error?.message || 'Internal server error.';

  if (statusCode >= 500) {
    if (isExpectedServerError(error)) {
      console.warn(`[expected ${statusCode}] ${message}`);
    } else {
      console.error(error);
    }
  }

  res.status(statusCode).json({
    error: {
      message,
      statusCode,
    },
  });
});

app.listen(port, host, () => {
  console.log(`Teen Writing Coach backend listening on http://${host}:${port}`);
});
