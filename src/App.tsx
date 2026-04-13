import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle,
  FileText,
  FolderOpen,
  Lightbulb,
  ListTree,
  Loader2,
  PenTool,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  User,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api, type Message, type Session, type SessionSummary } from './api.ts';

// Define writing phases
const PHASES = [
  { id: 'setup', name: '设定题目', icon: BookOpen, goal: '输入题目，准备开始本次写作训练。' },
  { id: 'analysis', name: '审题立意', icon: Lightbulb, goal: '找到题眼，明确中心思想。' },
  { id: 'brainstorm', name: '选材构思', icon: PenTool, goal: '回忆真实素材，筛选可写内容。' },
  { id: 'outline', name: '谋篇布局', icon: ListTree, goal: '安排结构，确定详略顺序。' },
  { id: 'draft', name: '起草成文', icon: FileText, goal: '把提纲展开成段落，开始成文。' },
  { id: 'review', name: '修改润色', icon: CheckCircle, goal: '检查语言、结构和细节，完成润色。' },
];

const GRADE_OPTIONS = [
  { value: '', label: '默认难度' },
  { value: 'primary-lower', label: '小学低年级' },
  { value: 'primary-upper', label: '小学高年级' },
  { value: 'middle-school', label: '初中' },
];

const ACTIVE_SESSION_STORAGE_KEY = 'teen-writing-coach.active-session-id';

function formatTimeLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '时间未知';
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function phaseNameFromIndex(index: number) {
  return PHASES[index]?.name || '写作训练';
}

function extractMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return '发生未知错误，请稍后再试。';
}

function SessionCard({
  session,
  isBusy,
  onOpen,
  onDelete,
  onRestore,
}: {
  session: SessionSummary;
  isBusy: boolean;
  onOpen: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  onRestore: (sessionId: string) => void;
}) {
  const deleted = Boolean(session.deletedAt);

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${deleted ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white hover:border-blue-200'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-800">{session.essayTitle}</h3>
            {deleted && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">
                已删除
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {phaseNameFromIndex(session.currentPhaseIndex)} · {formatTimeLabel(session.updatedAt)}
          </p>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
            {session.essayDraft?.trim() || '还没有草稿内容，打开后继续写作。'}
          </p>
        </div>
        <FolderOpen className="mt-0.5 shrink-0 text-slate-300" size={18} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          disabled={isBusy || deleted}
          onClick={() => onOpen(session.id)}
          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          打开继续写
        </button>
        {deleted ? (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onRestore(session.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={14} />
            恢复
          </button>
        ) : (
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onDelete(session.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={14} />
            删除
          </button>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<'home' | 'workspace'>('home');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [essayTitle, setEssayTitle] = useState('');
  const [gradeLevel, setGradeLevel] = useState('');
  const [input, setInput] = useState('');
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSwitchingPhase, setIsSwitchingPhase] = useState(false);
  const [sessionActionId, setSessionActionId] = useState<string | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastSavedDraftRef = useRef('');

  const currentPhaseIndex = activeSession?.currentPhaseIndex ?? 0;
  const currentPhase = PHASES[currentPhaseIndex] || PHASES[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.messages, isSending]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setIsLoadingSessions(true);
      try {
        const listResult = await api.listSessions();
        if (cancelled) {
          return;
        }

        setRecentSessions(listResult.sessions);
        const storedSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
        if (storedSessionId) {
          try {
            const { session } = await api.getSession(storedSessionId);
            if (cancelled) {
              return;
            }

            lastSavedDraftRef.current = session.essayDraft;
            setActiveSession(session);
            setDraftSaveState('saved');
            setScreen('workspace');
          } catch (error) {
            window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
            if (!cancelled) {
              setHomeError(`最近一次会话恢复失败：${extractMessage(error)}`);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setHomeError(extractMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSessions(false);
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeSession || screen !== 'workspace') {
      return;
    }

    if (activeSession.essayDraft === lastSavedDraftRef.current) {
      return;
    }

    const sessionId = activeSession.id;
    const draftToSave = activeSession.essayDraft;
    setDraftSaveState('saving');
    setWorkspaceError(null);

    const timer = window.setTimeout(async () => {
      try {
        const { session } = await api.saveDraft(sessionId, draftToSave);
        lastSavedDraftRef.current = draftToSave;
        setDraftSaveState('saved');
        setActiveSession((previous) => {
          if (!previous || previous.id !== sessionId) {
            return previous;
          }

          if (previous.essayDraft !== draftToSave) {
            return previous;
          }

          return {
            ...previous,
            updatedAt: session.updatedAt,
          };
        });
      } catch (error) {
        setDraftSaveState('error');
        setWorkspaceError(`草稿自动保存失败：${extractMessage(error)}`);
      }
    }, 700);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeSession?.essayDraft, activeSession?.id, screen]);

  async function refreshSessions() {
    setIsLoadingSessions(true);
    try {
      const result = await api.listSessions();
      setRecentSessions(result.sessions);
    } catch (error) {
      setHomeError(extractMessage(error));
    } finally {
      setIsLoadingSessions(false);
    }
  }

  function applySession(session: Session) {
    lastSavedDraftRef.current = session.essayDraft;
    setActiveSession(session);
    setScreen('workspace');
    setWorkspaceError(null);
    setDraftSaveState('saved');
    window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, session.id);
  }

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayTitle.trim()) {
      return;
    }

    setIsStarting(true);
    setHomeError(null);
    try {
      const { session } = await api.createSession({
        essayTitle: essayTitle.trim(),
        gradeLevel: gradeLevel || undefined,
      });
      applySession(session);
      setEssayTitle('');
      setGradeLevel('');
      await refreshSessions();
    } catch (error) {
      setHomeError(extractMessage(error));
    } finally {
      setIsStarting(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isSending || !activeSession) {
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setIsSending(true);
    setWorkspaceError(null);

    try {
      const { session } = await api.sendMessage(activeSession.id, userMsg);
      applySession(session);
      await refreshSessions();
    } catch (error) {
      setInput(userMsg);
      setWorkspaceError(extractMessage(error));
    } finally {
      setIsSending(false);
    }
  };

  async function handlePhaseChange(index: number) {
    if (!activeSession || index === 0 || index === activeSession.currentPhaseIndex) {
      return;
    }

    setIsSwitchingPhase(true);
    setWorkspaceError(null);
    try {
      const { session } = await api.updatePhase(activeSession.id, index);
      applySession(session);
      await refreshSessions();
    } catch (error) {
      setWorkspaceError(extractMessage(error));
    } finally {
      setIsSwitchingPhase(false);
    }
  }

  async function openSession(sessionId: string) {
    setSessionActionId(sessionId);
    setHomeError(null);
    try {
      const { session } = await api.getSession(sessionId);
      applySession(session);
    } catch (error) {
      setHomeError(extractMessage(error));
    } finally {
      setSessionActionId(null);
    }
  }

  async function deleteSession(sessionId: string) {
    setSessionActionId(sessionId);
    setHomeError(null);
    setWorkspaceError(null);
    try {
      await api.deleteSession(sessionId);
      if (activeSession?.id === sessionId) {
        setActiveSession(null);
        setScreen('home');
        setDraftSaveState('idle');
        window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
      }
      await refreshSessions();
    } catch (error) {
      const message = extractMessage(error);
      if (activeSession?.id === sessionId) {
        setWorkspaceError(message);
      } else {
        setHomeError(message);
      }
    } finally {
      setSessionActionId(null);
    }
  }

  async function restoreSession(sessionId: string) {
    setSessionActionId(sessionId);
    setHomeError(null);
    try {
      const { session } = await api.restoreSession(sessionId);
      await refreshSessions();
      applySession(session);
    } catch (error) {
      setHomeError(extractMessage(error));
    } finally {
      setSessionActionId(null);
    }
  }

  function returnHome() {
    setScreen('home');
    setWorkspaceError(null);
  }

  function createNewSession() {
    setActiveSession(null);
    setEssayTitle('');
    setGradeLevel('');
    setDraftSaveState('idle');
    window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    setScreen('home');
  }

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="flex items-center gap-3 rounded-2xl bg-white px-6 py-5 shadow-sm ring-1 ring-slate-200">
          <Loader2 className="animate-spin text-blue-600" size={20} />
          <span className="text-sm text-slate-600">正在恢复你的写作会话...</span>
        </div>
      </div>
    );
  }

  if (screen === 'home') {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-blue-600">
              <Bot size={34} />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">青少年写作教练</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">
              这是学生单人版 MVP。输入作文题目后，系统会创建独立写作会话，后续聊天、草稿和阶段都会自动保存到后端。
            </p>

            {homeError && (
              <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertCircle className="mt-0.5 shrink-0" size={16} />
                <span>{homeError}</span>
              </div>
            )}

            <form onSubmit={handleStart} className="mt-8 space-y-4">
              <div>
                <label htmlFor="essay-title" className="mb-2 block text-sm font-medium text-slate-700">
                  作文题目
                </label>
                <input
                  id="essay-title"
                  type="text"
                  value={essayTitle}
                  onChange={(e) => setEssayTitle(e.target.value)}
                  placeholder="例如：难忘的一天、我的梦想..."
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-lg outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div>
                <label htmlFor="grade-level" className="mb-2 block text-sm font-medium text-slate-700">
                  学段
                </label>
                <select
                  id="grade-level"
                  value={gradeLevel}
                  onChange={(e) => setGradeLevel(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                >
                  {GRADE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={isStarting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isStarting ? <Loader2 className="animate-spin" size={18} /> : <Plus size={18} />}
                开始新的写作训练
              </button>
            </form>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">最近写作会话</h2>
                <p className="mt-1 text-sm text-slate-500">支持继续写、删除和恢复。</p>
              </div>
              {isLoadingSessions && <Loader2 className="animate-spin text-slate-400" size={18} />}
            </div>

            {recentSessions.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                还没有历史会话。创建第一篇作文后，这里会出现最近写作记录。
              </div>
            ) : (
              <div className="space-y-3">
                {recentSessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    isBusy={sessionActionId === session.id}
                    onOpen={openSession}
                    onDelete={deleteSession}
                    onRestore={restoreSession}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!activeSession) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Bot className="text-blue-600" />
                题目：《{activeSession.essayTitle}》
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {activeSession.gradeLevel ? `学段：${GRADE_OPTIONS.find((option) => option.value === activeSession.gradeLevel)?.label || activeSession.gradeLevel}` : '未设置学段'} · 最近更新：{formatTimeLabel(activeSession.updatedAt)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={returnHome}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
              >
                <ArrowLeft size={16} />
                会话列表
              </button>
              <button
                type="button"
                onClick={createNewSession}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
              >
                <Plus size={16} />
                新建作文
              </button>
              <button
                type="button"
                onClick={() => deleteSession(activeSession.id)}
                disabled={sessionActionId === activeSession.id}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={16} />
                删除当前作文
              </button>
            </div>
          </div>

          {workspaceError && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="mt-0.5 shrink-0" size={16} />
              <span>{workspaceError}</span>
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-slate-500 flex items-center gap-2">
              <Bot className="text-blue-600" />
              当前目标：{currentPhase.goal}
            </h2>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${
              draftSaveState === 'saving'
                ? 'bg-amber-100 text-amber-700'
                : draftSaveState === 'error'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-emerald-100 text-emerald-700'
            }`}>
              {draftSaveState === 'saving'
                ? '草稿保存中'
                : draftSaveState === 'error'
                  ? '草稿保存失败'
                  : '草稿已保存'}
            </span>
          </div>

          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 -z-10"></div>
            {PHASES.slice(1).map((phase, idx) => {
              const actualIndex = idx + 1;
              const isActive = currentPhaseIndex === actualIndex;
              const isPast = currentPhaseIndex > actualIndex;
              const Icon = phase.icon;
              
              return (
                <button
                  key={phase.id}
                  onClick={() => void handlePhaseChange(actualIndex)}
                  disabled={isSwitchingPhase}
                  className={`flex flex-col items-center gap-2 group ${isActive ? 'text-blue-600' : isPast ? 'text-green-500' : 'text-slate-400'}`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                    isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 
                    isPast ? 'bg-green-500 text-white' : 
                    'bg-white border-2 border-slate-200 group-hover:border-blue-300'
                  }`}>
                    <Icon size={20} />
                  </div>
                  <span className="text-xs font-medium hidden sm:block">{phase.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
            <Bot className="text-blue-600" size={20} />
            <span className="font-medium text-blue-900">教练辅导 - 当前阶段：{currentPhase.name}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {activeSession.messages.map((msg: Message, idx: number) => (
              <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user' 
                    ? 'bg-indigo-600 text-white rounded-tr-none' 
                    : 'bg-slate-100 text-slate-800 rounded-tl-none'
                }`}>
                  {msg.role === 'model' ? (
                    <div className="markdown-body text-sm leading-relaxed prose prose-slate max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                  <Bot size={16} />
                </div>
                <div className="bg-slate-100 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                  <Loader2 className="animate-spin text-slate-400" size={16} />
                  <span className="text-sm text-slate-500">教练正在思考...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-100">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="回复教练..."
                disabled={isSending}
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isSending}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool className="text-amber-600" size={20} />
              <span className="font-medium text-amber-900">我的草稿本</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-md">
                {activeSession.essayDraft.length} 字
              </span>
              <span className="text-xs text-slate-500">
                自动保存
              </span>
            </div>
          </div>
          
          <div className="flex-1 p-4">
            <textarea
              value={activeSession.essayDraft}
              onChange={(e) => {
                const nextDraft = e.target.value;
                setActiveSession((previous) => (
                  previous
                    ? {
                        ...previous,
                        essayDraft: nextDraft,
                      }
                    : previous
                ));
              }}
              placeholder="在这里记录你的灵感、提纲和正文草稿...&#10;教练不会直接帮你写，你需要自己动手哦！"
              className="w-full h-full resize-none outline-none text-slate-700 leading-relaxed text-base placeholder:text-slate-300"
            />
          </div>
        </div>

      </main>
    </div>
  );
}
