function authError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function parseApiKeysConfig() {
  const raw = process.env.AUTH_API_KEYS_JSON?.trim();
  if (!raw) {
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw authError('AUTH_API_KEYS_JSON must be valid JSON.', 500);
  }

  if (!Array.isArray(parsed)) {
    throw authError('AUTH_API_KEYS_JSON must be a JSON array.', 500);
  }

  return parsed.map((entry, index) => {
    if (!entry?.key || !entry?.userId) {
      throw authError(
        `AUTH_API_KEYS_JSON entry at index ${index} must include key and userId.`,
        500,
      );
    }

    return {
      key: String(entry.key),
      userId: String(entry.userId),
      role: entry.role === 'admin' ? 'admin' : 'user',
      label: entry.label ? String(entry.label) : null,
    };
  });
}

function extractApiKey(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
    return authorization.slice('Bearer '.length).trim();
  }

  const headerApiKey = req.headers['x-api-key'];
  if (typeof headerApiKey === 'string') {
    return headerApiKey.trim();
  }

  return '';
}

export function createAuthManager() {
  const mode = (process.env.AUTH_MODE || 'disabled').trim().toLowerCase();
  if (mode === 'disabled') {
    return {
      mode,
      enabled: false,
      authenticateRequest() {
        return {
          userId: null,
          role: 'anonymous',
          label: null,
        };
      },
      canAccessOwner(auth, ownerUserId) {
        return !ownerUserId || auth.role === 'anonymous';
      },
    };
  }

  if (mode !== 'api-key') {
    throw authError('AUTH_MODE must be either "disabled" or "api-key".', 500);
  }

  const entries = parseApiKeysConfig();
  const byKey = new Map(entries.map((entry) => [entry.key, entry]));

  return {
    mode,
    enabled: true,
    authenticateRequest(req) {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        throw authError('Missing API key.');
      }

      const entry = byKey.get(apiKey);
      if (!entry) {
        throw authError('Invalid API key.');
      }

      return {
        userId: entry.userId,
        role: entry.role,
        label: entry.label,
      };
    },
    canAccessOwner(auth, ownerUserId) {
      if (auth.role === 'admin') {
        return true;
      }

      return Boolean(ownerUserId) && ownerUserId === auth.userId;
    },
  };
}
