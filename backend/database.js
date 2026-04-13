import fs from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function resolveDataPaths(projectRoot) {
  return {
    dbPath: path.resolve(
      projectRoot,
      process.env.SQLITE_DB_PATH || 'data/teen-writing-coach.db',
    ),
    legacySessionDir: path.resolve(
      projectRoot,
      process.env.SESSION_STORAGE_DIR || 'data/sessions',
    ),
  };
}

function parseMessages(messagesJson) {
  try {
    const parsed = JSON.parse(messagesJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildSessionSummary(row) {
  return {
    id: row.id,
    essayTitle: row.essay_title,
    essayDraft: row.essay_draft,
    currentPhaseIndex: row.current_phase_index,
    gradeLevel: row.grade_level,
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messageCount: row.message_count,
    deletedAt: row.deleted_at,
  };
}

function mapRowToSession(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    essayTitle: row.essay_title,
    essayDraft: row.essay_draft,
    currentPhaseIndex: row.current_phase_index,
    gradeLevel: row.grade_level,
    ownerUserId: row.owner_user_id,
    messages: parseMessages(row.messages_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function validateSessionId(sessionId) {
  if (!/^[a-zA-Z0-9-]+$/.test(sessionId)) {
    const error = new Error('Invalid session id.');
    error.statusCode = 400;
    throw error;
  }
}

function normalizeListOptions(options = {}) {
  const limit = Number(options.limit ?? 20);
  const offset = Number(options.offset ?? 0);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error('limit must be an integer between 1 and 100.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    const error = new Error('offset must be an integer greater than or equal to 0.');
    error.statusCode = 400;
    throw error;
  }

  return {
    q: typeof options.q === 'string' ? options.q.trim() : '',
    limit,
    offset,
    includeDeleted: options.includeDeleted === true || options.includeDeleted === 'true',
    deletedOnly: options.deletedOnly === true || options.deletedOnly === 'true',
    ownerUserId:
      typeof options.ownerUserId === 'string' && options.ownerUserId.trim()
        ? options.ownerUserId.trim()
        : null,
  };
}

function normalizeInvocationListOptions(options = {}) {
  const limit = Number(options.limit ?? 20);
  const offset = Number(options.offset ?? 0);

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error('limit must be an integer between 1 and 100.');
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isInteger(offset) || offset < 0) {
    const error = new Error('offset must be an integer greater than or equal to 0.');
    error.statusCode = 400;
    throw error;
  }

  const sessionId =
    typeof options.sessionId === 'string' && options.sessionId.trim()
      ? options.sessionId.trim()
      : null;
  if (sessionId) {
    validateSessionId(sessionId);
  }

  const createdAfter =
    typeof options.createdAfter === 'string' && options.createdAfter.trim()
      ? options.createdAfter.trim()
      : null;
  const createdBefore =
    typeof options.createdBefore === 'string' && options.createdBefore.trim()
      ? options.createdBefore.trim()
      : null;

  for (const [label, value] of [['createdAfter', createdAfter], ['createdBefore', createdBefore]]) {
    if (value && Number.isNaN(Date.parse(value))) {
      const error = new Error(`${label} must be a valid ISO-8601 datetime string.`);
      error.statusCode = 400;
      throw error;
    }
  }

  return {
    limit,
    offset,
    sessionId,
    status:
      typeof options.status === 'string' && options.status.trim()
        ? options.status.trim().toLowerCase()
        : null,
    userId:
      typeof options.userId === 'string' && options.userId.trim()
        ? options.userId.trim()
        : null,
    createdAfter,
    createdBefore,
  };
}

function ensureColumn(db, tableName, columnName, columnDefinition) {
  const hasColumn = db
    .prepare(`SELECT COUNT(*) AS count FROM pragma_table_info('${tableName}') WHERE name = ?`)
    .get(columnName)
    .count > 0;

  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  }
}

export async function initializeDatabase(paths) {
  await fs.mkdir(path.dirname(paths.dbPath), { recursive: true });

  const db = new DatabaseSync(paths.dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      essay_title TEXT NOT NULL,
      essay_draft TEXT NOT NULL DEFAULT '',
      current_phase_index INTEGER NOT NULL,
      grade_level TEXT,
      owner_user_id TEXT,
      messages_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS model_invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      user_id TEXT,
      provider TEXT NOT NULL,
      model_name TEXT,
      status TEXT NOT NULL,
      attempt_count INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      request_chars INTEGER NOT NULL,
      response_chars INTEGER NOT NULL,
      request_tokens_estimate INTEGER NOT NULL DEFAULT 0,
      response_tokens_estimate INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL,
      cost_currency TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bucket_key TEXT NOT NULL,
      created_at_ms INTEGER NOT NULL
    );
  `);

  ensureColumn(db, 'sessions', 'deleted_at', 'deleted_at TEXT');
  ensureColumn(db, 'sessions', 'owner_user_id', 'owner_user_id TEXT');
  ensureColumn(db, 'model_invocations', 'user_id', 'user_id TEXT');
  ensureColumn(
    db,
    'model_invocations',
    'request_tokens_estimate',
    'request_tokens_estimate INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(
    db,
    'model_invocations',
    'response_tokens_estimate',
    'response_tokens_estimate INTEGER NOT NULL DEFAULT 0',
  );
  ensureColumn(db, 'model_invocations', 'estimated_cost', 'estimated_cost REAL');
  ensureColumn(db, 'model_invocations', 'cost_currency', 'cost_currency TEXT');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_updated_at
      ON sessions(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_deleted_at
      ON sessions(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_owner_user_id
      ON sessions(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_model_invocations_created_at
      ON model_invocations(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_invocations_session_id
      ON model_invocations(session_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_model_invocations_user_id
      ON model_invocations(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_rate_limit_events_bucket_key
      ON rate_limit_events(bucket_key, created_at_ms);
  `);

  const statements = {
    insertSession: db.prepare(`
      INSERT INTO sessions (
        id,
        essay_title,
        essay_draft,
        current_phase_index,
        grade_level,
        owner_user_id,
        messages_json,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @essay_title,
        @essay_draft,
        @current_phase_index,
        @grade_level,
        @owner_user_id,
        @messages_json,
        @created_at,
        @updated_at,
        @deleted_at
      )
    `),
    upsertSession: db.prepare(`
      INSERT INTO sessions (
        id,
        essay_title,
        essay_draft,
        current_phase_index,
        grade_level,
        owner_user_id,
        messages_json,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @essay_title,
        @essay_draft,
        @current_phase_index,
        @grade_level,
        @owner_user_id,
        @messages_json,
        @created_at,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO UPDATE SET
        essay_title = excluded.essay_title,
        essay_draft = excluded.essay_draft,
        current_phase_index = excluded.current_phase_index,
        grade_level = excluded.grade_level,
        owner_user_id = excluded.owner_user_id,
        messages_json = excluded.messages_json,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at
    `),
    insertLegacySession: db.prepare(`
      INSERT INTO sessions (
        id,
        essay_title,
        essay_draft,
        current_phase_index,
        grade_level,
        owner_user_id,
        messages_json,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        @id,
        @essay_title,
        @essay_draft,
        @current_phase_index,
        @grade_level,
        @owner_user_id,
        @messages_json,
        @created_at,
        @updated_at,
        @deleted_at
      )
      ON CONFLICT(id) DO NOTHING
    `),
    readSession: db.prepare(`
      SELECT
        id,
        essay_title,
        essay_draft,
        current_phase_index,
        grade_level,
        owner_user_id,
        messages_json,
        created_at,
        updated_at,
        deleted_at
      FROM sessions
      WHERE id = ?
    `),
    updateSessionDeletedAt: db.prepare(`
      UPDATE sessions
      SET deleted_at = ?, updated_at = ?
      WHERE id = ?
    `),
    insertModelInvocation: db.prepare(`
      INSERT INTO model_invocations (
        session_id,
        user_id,
        provider,
        model_name,
        status,
        attempt_count,
        duration_ms,
        request_chars,
        response_chars,
        request_tokens_estimate,
        response_tokens_estimate,
        estimated_cost,
        cost_currency,
        error_message,
        created_at
      ) VALUES (
        @session_id,
        @user_id,
        @provider,
        @model_name,
        @status,
        @attempt_count,
        @duration_ms,
        @request_chars,
        @response_chars,
        @request_tokens_estimate,
        @response_tokens_estimate,
        @estimated_cost,
        @cost_currency,
        @error_message,
        @created_at
      )
    `),
    insertRateLimitEvent: db.prepare(`
      INSERT INTO rate_limit_events (
        bucket_key,
        created_at_ms
      ) VALUES (?, ?)
    `),
    countRateLimitEvents: db.prepare(`
      SELECT COUNT(*) AS total
      FROM rate_limit_events
      WHERE bucket_key = ? AND created_at_ms > ?
    `),
    deleteExpiredRateLimitEvents: db.prepare(`
      DELETE FROM rate_limit_events
      WHERE created_at_ms <= ?
    `),
  };

  return {
    db,
    paths,
    createSession(session) {
      statements.insertSession.run({
        id: session.id,
        essay_title: session.essayTitle,
        essay_draft: session.essayDraft,
        current_phase_index: session.currentPhaseIndex,
        grade_level: session.gradeLevel,
        owner_user_id: session.ownerUserId || null,
        messages_json: JSON.stringify(session.messages),
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        deleted_at: session.deletedAt || null,
      });

      return session;
    },
    saveSession(session) {
      statements.upsertSession.run({
        id: session.id,
        essay_title: session.essayTitle,
        essay_draft: session.essayDraft,
        current_phase_index: session.currentPhaseIndex,
        grade_level: session.gradeLevel,
        owner_user_id: session.ownerUserId || null,
        messages_json: JSON.stringify(session.messages),
        created_at: session.createdAt,
        updated_at: session.updatedAt,
        deleted_at: session.deletedAt || null,
      });

      return session;
    },
    readSession(sessionId, options = {}) {
      validateSessionId(sessionId);
      const session = mapRowToSession(statements.readSession.get(sessionId));
      if (!session || (session.deletedAt && !options.includeDeleted)) {
        const error = new Error('Session not found.');
        error.statusCode = 404;
        throw error;
      }

      return session;
    },
    listSessions(options = {}) {
      const normalized = normalizeListOptions(options);
      const escapedSearch = normalized.q.replaceAll('\\', '\\\\')
        .replaceAll('%', '\\%')
        .replaceAll('_', '\\_');
      const params = {
        search: normalized.q,
        search_like: `%${escapedSearch}%`,
      };
      const whereClauses = [
        `(
          @search = ''
          OR essay_title LIKE @search_like ESCAPE '\\'
          OR essay_draft LIKE @search_like ESCAPE '\\'
          OR COALESCE(grade_level, '') LIKE @search_like ESCAPE '\\'
        )`,
      ];

      if (normalized.ownerUserId) {
        whereClauses.push(`owner_user_id = @owner_user_id`);
        params.owner_user_id = normalized.ownerUserId;
      }

      if (normalized.deletedOnly) {
        whereClauses.push(`deleted_at IS NOT NULL`);
      } else if (!normalized.includeDeleted) {
        whereClauses.push(`deleted_at IS NULL`);
      }

      const whereSql = whereClauses.join('\n          AND ');
      const countStatement = db.prepare(`
        SELECT COUNT(*) AS total
        FROM sessions
        WHERE ${whereSql}
      `);
      const listStatement = db.prepare(`
        SELECT
          id,
          essay_title,
          essay_draft,
          current_phase_index,
          grade_level,
          owner_user_id,
          created_at,
          updated_at,
          json_array_length(messages_json) AS message_count,
          deleted_at
        FROM sessions
        WHERE ${whereSql}
        ORDER BY updated_at DESC
        LIMIT ${normalized.limit} OFFSET ${normalized.offset}
      `);

      const total = countStatement.get(params).total;
      const sessions = listStatement.all(params).map(buildSessionSummary);

      return {
        sessions,
        pagination: {
          total,
          limit: normalized.limit,
          offset: normalized.offset,
          hasMore: normalized.offset + sessions.length < total,
        },
        query: normalized.q,
        filters: {
          includeDeleted: normalized.includeDeleted,
          deletedOnly: normalized.deletedOnly,
          ownerUserId: normalized.ownerUserId,
        },
      };
    },
    softDeleteSession(sessionId) {
      const session = this.readSession(sessionId, { includeDeleted: true });
      const now = new Date().toISOString();
      statements.updateSessionDeletedAt.run(session.deletedAt || now, now, sessionId);
    },
    restoreSession(sessionId) {
      const session = this.readSession(sessionId, { includeDeleted: true });
      if (!session.deletedAt) {
        return this.readSession(sessionId, { includeDeleted: true });
      }

      const now = new Date().toISOString();
      statements.updateSessionDeletedAt.run(null, now, sessionId);
      return this.readSession(sessionId);
    },
    createModelInvocation(log) {
      statements.insertModelInvocation.run({
        session_id: log.sessionId || null,
        user_id: log.userId || null,
        provider: log.provider,
        model_name: log.modelName || null,
        status: log.status,
        attempt_count: log.attemptCount,
        duration_ms: log.durationMs,
        request_chars: log.requestChars,
        response_chars: log.responseChars,
        request_tokens_estimate: log.requestTokensEstimate || 0,
        response_tokens_estimate: log.responseTokensEstimate || 0,
        estimated_cost: log.estimatedCost ?? null,
        cost_currency: log.costCurrency || null,
        error_message: log.errorMessage || null,
        created_at: log.createdAt || new Date().toISOString(),
      });
    },
    listModelInvocations(options = {}) {
      const normalized = normalizeInvocationListOptions(options);
      const filters = [];
      const params = {};

      if (normalized.sessionId) {
        filters.push('session_id = @session_id');
        params.session_id = normalized.sessionId;
      }

      if (normalized.status) {
        filters.push('status = @status');
        params.status = normalized.status;
      }

      if (normalized.userId) {
        filters.push('user_id = @user_id');
        params.user_id = normalized.userId;
      }

      if (normalized.createdAfter) {
        filters.push('created_at >= @created_after');
        params.created_after = normalized.createdAfter;
      }

      if (normalized.createdBefore) {
        filters.push('created_at <= @created_before');
        params.created_before = normalized.createdBefore;
      }

      const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const countStatement = db.prepare(`
        SELECT COUNT(*) AS total
        FROM model_invocations
        ${whereSql}
      `);
      const listStatement = db.prepare(`
        SELECT
          id,
          session_id,
          user_id,
          provider,
          model_name,
          status,
          attempt_count,
          duration_ms,
          request_chars,
          response_chars,
          request_tokens_estimate,
          response_tokens_estimate,
          estimated_cost,
          cost_currency,
          error_message,
          created_at
        FROM model_invocations
        ${whereSql}
        ORDER BY created_at DESC
        LIMIT ${normalized.limit} OFFSET ${normalized.offset}
      `);

      const total = countStatement.get(params).total;

      return {
        logs: listStatement.all(params).map((row) => ({
          id: row.id,
          sessionId: row.session_id,
          userId: row.user_id,
          provider: row.provider,
          modelName: row.model_name,
          status: row.status,
          attemptCount: row.attempt_count,
          durationMs: row.duration_ms,
          requestChars: row.request_chars,
          responseChars: row.response_chars,
          requestTokensEstimate: row.request_tokens_estimate,
          responseTokensEstimate: row.response_tokens_estimate,
          estimatedCost: row.estimated_cost,
          costCurrency: row.cost_currency,
          errorMessage: row.error_message,
          createdAt: row.created_at,
        })),
        pagination: {
          total,
          limit: normalized.limit,
          offset: normalized.offset,
          hasMore: normalized.offset + normalized.limit < total,
        },
        filters: {
          sessionId: normalized.sessionId,
          status: normalized.status,
          userId: normalized.userId,
          createdAfter: normalized.createdAfter,
          createdBefore: normalized.createdBefore,
        },
      };
    },
    getModelUsageReport(options = {}) {
      const normalized = normalizeInvocationListOptions({
        limit: 1,
        offset: 0,
        sessionId: options.sessionId,
        status: options.status,
        userId: options.userId,
        createdAfter: options.createdAfter,
        createdBefore: options.createdBefore,
      });
      const filters = [];
      const params = {};

      if (normalized.sessionId) {
        filters.push('session_id = @session_id');
        params.session_id = normalized.sessionId;
      }

      if (normalized.status) {
        filters.push('status = @status');
        params.status = normalized.status;
      }

      if (normalized.userId) {
        filters.push('user_id = @user_id');
        params.user_id = normalized.userId;
      }

      if (normalized.createdAfter) {
        filters.push('created_at >= @created_after');
        params.created_after = normalized.createdAfter;
      }

      if (normalized.createdBefore) {
        filters.push('created_at <= @created_before');
        params.created_before = normalized.createdBefore;
      }

      const whereSql = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
      const summary = db.prepare(`
        SELECT
          COUNT(*) AS total_calls,
          SUM(attempt_count) AS total_attempts,
          SUM(duration_ms) AS total_duration_ms,
          SUM(request_chars) AS total_request_chars,
          SUM(response_chars) AS total_response_chars,
          SUM(request_tokens_estimate) AS total_request_tokens_estimate,
          SUM(response_tokens_estimate) AS total_response_tokens_estimate,
          SUM(COALESCE(estimated_cost, 0)) AS total_estimated_cost
        FROM model_invocations
        ${whereSql}
      `).get(params);
      const breakdown = db.prepare(`
        SELECT
          provider,
          model_name,
          status,
          COUNT(*) AS call_count,
          SUM(attempt_count) AS total_attempts,
          SUM(duration_ms) AS total_duration_ms,
          SUM(request_tokens_estimate) AS total_request_tokens_estimate,
          SUM(response_tokens_estimate) AS total_response_tokens_estimate,
          SUM(COALESCE(estimated_cost, 0)) AS total_estimated_cost,
          MAX(cost_currency) AS cost_currency
        FROM model_invocations
        ${whereSql}
        GROUP BY provider, model_name, status
        ORDER BY call_count DESC, provider ASC, model_name ASC, status ASC
      `).all(params);

      return {
        summary: {
          totalCalls: summary.total_calls || 0,
          totalAttempts: summary.total_attempts || 0,
          totalDurationMs: summary.total_duration_ms || 0,
          totalRequestChars: summary.total_request_chars || 0,
          totalResponseChars: summary.total_response_chars || 0,
          totalRequestTokensEstimate: summary.total_request_tokens_estimate || 0,
          totalResponseTokensEstimate: summary.total_response_tokens_estimate || 0,
          totalEstimatedCost: summary.total_estimated_cost || 0,
          currencies: [...new Set(breakdown.map((row) => row.cost_currency).filter(Boolean))],
        },
        breakdown: breakdown.map((row) => ({
          provider: row.provider,
          modelName: row.model_name,
          status: row.status,
          callCount: row.call_count,
          totalAttempts: row.total_attempts || 0,
          totalDurationMs: row.total_duration_ms || 0,
          totalRequestTokensEstimate: row.total_request_tokens_estimate || 0,
          totalResponseTokensEstimate: row.total_response_tokens_estimate || 0,
          totalEstimatedCost: row.total_estimated_cost || 0,
          costCurrency: row.cost_currency || null,
        })),
        filters: {
          sessionId: normalized.sessionId,
          status: normalized.status,
          userId: normalized.userId,
          createdAfter: normalized.createdAfter,
          createdBefore: normalized.createdBefore,
        },
      };
    },
    consumeRateLimit({ bucketKey, maxRequests, windowMs }) {
      const normalizedKey = String(bucketKey || 'anonymous');
      const max = Number(maxRequests);
      const window = Number(windowMs);

      if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(window) || window <= 0) {
        return {
          allowed: true,
          limit: max,
          remaining: Infinity,
          retryAfterMs: 0,
          resetAt: Date.now(),
        };
      }

      const now = Date.now();
      const cutoff = now - window;

      db.exec('BEGIN IMMEDIATE');
      try {
        statements.deleteExpiredRateLimitEvents.run(cutoff);
        const currentCount = statements.countRateLimitEvents.get(normalizedKey, cutoff).total;
        if (currentCount >= max) {
          const resetRow = db.prepare(`
            SELECT MIN(created_at_ms) AS earliest
            FROM rate_limit_events
            WHERE bucket_key = ? AND created_at_ms > ?
          `).get(normalizedKey, cutoff);
          db.exec('COMMIT');
          const earliest = resetRow.earliest || now;
          return {
            allowed: false,
            limit: max,
            remaining: 0,
            retryAfterMs: Math.max(0, earliest + window - now),
            resetAt: earliest + window,
          };
        }

        statements.insertRateLimitEvent.run(normalizedKey, now);
        db.exec('COMMIT');
        return {
          allowed: true,
          limit: max,
          remaining: Math.max(0, max - currentCount - 1),
          retryAfterMs: 0,
          resetAt: now + window,
        };
      } catch (error) {
        try {
          db.exec('ROLLBACK');
        } catch {}
        throw error;
      }
    },
    async importLegacyJsonSessions() {
      let files = [];
      try {
        files = await fs.readdir(paths.legacySessionDir);
      } catch (error) {
        if (error?.code === 'ENOENT') {
          return 0;
        }

        throw error;
      }

      let imported = 0;
      for (const fileName of files) {
        if (!fileName.endsWith('.json')) {
          continue;
        }

        const raw = await fs.readFile(
          path.join(paths.legacySessionDir, fileName),
          'utf-8',
        );
        const parsed = JSON.parse(raw);
        if (!parsed?.id || !parsed?.essayTitle) {
          continue;
        }

        const result = statements.insertLegacySession.run({
          id: parsed.id,
          essay_title: parsed.essayTitle,
          essay_draft: parsed.essayDraft || '',
          current_phase_index: Number(parsed.currentPhaseIndex || 1),
          grade_level: parsed.gradeLevel || null,
          owner_user_id: parsed.ownerUserId || null,
          messages_json: JSON.stringify(
            Array.isArray(parsed.messages) ? parsed.messages : [],
          ),
          created_at: parsed.createdAt || new Date().toISOString(),
          updated_at: parsed.updatedAt || new Date().toISOString(),
          deleted_at: parsed.deletedAt || null,
        });

        if (result.changes > 0) {
          imported += 1;
        }
      }

      return imported;
    },
  };
}
