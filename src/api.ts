export type Message = {
  role: 'user' | 'model';
  content: string;
};

export type Session = {
  id: string;
  essayTitle: string;
  essayDraft: string;
  currentPhaseIndex: number;
  gradeLevel: string | null;
  ownerUserId: string | null;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type SessionSummary = {
  id: string;
  essayTitle: string;
  essayDraft: string;
  currentPhaseIndex: number;
  gradeLevel: string | null;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  deletedAt: string | null;
};

type SessionResponse = {
  session: Session;
};

type SessionsResponse = {
  sessions: SessionSummary[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  query: string;
  filters: {
    includeDeleted: boolean;
    deletedOnly: boolean;
    ownerUserId: string | null;
  };
};

type SendMessageResponse = {
  reply: string;
  session: Session;
};

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8787/api';

function normalizeBaseUrl() {
  const raw = (import.meta.env.VITE_API_BASE_URL || DEFAULT_API_BASE_URL).trim();
  return raw.replace(/\/$/, '');
}

function buildHeaders() {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const apiKey = import.meta.env.VITE_API_KEY?.trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

function buildQuery(params: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl()}${path}`, {
      ...init,
      headers: {
        ...buildHeaders(),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error('无法连接后端服务，请确认前后端都已启动。');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.message ||
      '请求失败，请稍后再试。';
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  listSessions(params: {
    limit?: number;
    offset?: number;
    q?: string;
    includeDeleted?: boolean;
  } = {}) {
    return request<SessionsResponse>(
      `/sessions${buildQuery({
        limit: params.limit ?? 8,
        offset: params.offset ?? 0,
        q: params.q,
        includeDeleted: params.includeDeleted ?? true,
      })}`,
    );
  },
  createSession(payload: { essayTitle: string; gradeLevel?: string }) {
    return request<SessionResponse>('/sessions', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSession(sessionId: string, options: { includeDeleted?: boolean } = {}) {
    return request<SessionResponse>(
      `/sessions/${sessionId}${buildQuery({
        includeDeleted: options.includeDeleted,
      })}`,
    );
  },
  saveDraft(sessionId: string, essayDraft: string) {
    return request<SessionResponse>(`/sessions/${sessionId}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ essayDraft }),
    });
  },
  updatePhase(sessionId: string, currentPhaseIndex: number) {
    return request<SessionResponse>(`/sessions/${sessionId}/phase`, {
      method: 'PATCH',
      body: JSON.stringify({ currentPhaseIndex }),
    });
  },
  sendMessage(sessionId: string, message: string) {
    return request<SendMessageResponse>(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
  deleteSession(sessionId: string) {
    return request<void>(`/sessions/${sessionId}`, {
      method: 'DELETE',
    });
  },
  restoreSession(sessionId: string) {
    return request<SessionResponse>(`/sessions/${sessionId}/restore`, {
      method: 'POST',
    });
  },
};
