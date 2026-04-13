import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Send, BookOpen, PenTool, Lightbulb, ListTree, FileText, CheckCircle, Bot, User, Loader2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Define writing phases
const PHASES = [
  { id: 'setup', name: '设定题目', icon: BookOpen },
  { id: 'analysis', name: '审题立意', icon: Lightbulb },
  { id: 'brainstorm', name: '选材构思', icon: PenTool },
  { id: 'outline', name: '谋篇布局', icon: ListTree },
  { id: 'draft', name: '起草成文', icon: FileText },
  { id: 'review', name: '修改润色', icon: CheckCircle },
];

type Message = {
  role: 'user' | 'model';
  content: string;
};

export default function App() {
  const [essayTitle, setEssayTitle] = useState('');
  const [essayDraft, setEssayDraft] = useState('');
  const [currentPhaseIndex, setCurrentPhaseIndex] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currentPhase = PHASES[currentPhaseIndex];

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getSystemPrompt = (phaseId: string, title: string) => {
    const basePrompt = `你是一个专门为9-16岁青少年设计的“引导式写作教练”。你的核心任务是：通过苏格拉底式提问启发学生思考，帮助他们建立写作逻辑。
绝对禁止：直接替学生写出完整的段落或文章。
交互原则：
1. 每次只问一个启发式问题，不要一次性抛出多个问题。
2. 语气要亲切、鼓励、符合青少年的认知水平（可以适当使用emoji）。
3. 如果学生回答不知道，给出2-3个思考方向的提示（脚手架），而不是直接给答案。
4. 引导学生将讨论的结果写在右侧的“我的草稿”中。
5. 严格遵守当前阶段的任务，如果当前阶段目标达成，主动提示学生点击上方的进度条进入下一阶段。

当前学生的作文题目是：《${title}》
当前处于写作的【${PHASES.find(p => p.id === phaseId)?.name}】阶段。
`;

    const phaseInstructions: Record<string, string> = {
      analysis: '此阶段目标：引导学生分析题目中的关键词（题眼），明确文章要表达的中心思想（立意）。问他们看到了题目首先想到什么？',
      brainstorm: '此阶段目标：引导学生回忆生活中的真实经历、阅读过的素材，挑选最能表达中心思想的材料。问他们有没有具体的故事或例子？',
      outline: '此阶段目标：引导学生安排文章的结构（开头、中间、结尾）。先写什么，后写什么？哪里需要详写，哪里需要略写？',
      draft: '此阶段目标：鼓励学生开始动笔写具体的段落。可以一段一段地引导，关注细节描写（动作、语言、心理等）。',
      review: '此阶段目标：引导学生检查自己的草稿。句子是否通顺？有没有错别字？开头结尾是否呼应？细节是否足够生动？',
    };

    return basePrompt + '\n' + (phaseInstructions[phaseId] || '');
  };

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!essayTitle.trim()) return;
    
    setCurrentPhaseIndex(1); // Move to analysis
    
    // Initial greeting
    const initialMessage = `你好！我是你的写作教练。今天我们要挑战的题目是《${essayTitle}》。\n\n我们先从第一步“审题立意”开始吧！看到这个题目，你觉得最核心的词（题眼）是哪几个？你想通过这篇文章表达什么情感或道理呢？`;
    setMessages([{ role: 'model', content: initialMessage }]);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const systemInstruction = getSystemPrompt(currentPhase.id, essayTitle);
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userMsg }] }
        ],
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const aiResponse = response.text || '抱歉，我刚才走神了，你能再说一遍吗？';
      setMessages(prev => [...prev, { role: 'model', content: aiResponse }]);
    } catch (error) {
      console.error('Error calling Gemini:', error);
      setMessages(prev => [...prev, { role: 'model', content: '哎呀，网络好像有点问题，请稍后再试哦。' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePhaseChange = (index: number) => {
    if (index === 0) return; // Don't go back to setup
    setCurrentPhaseIndex(index);
    
    // Add a transition message from the AI
    const transitionMsg = `太棒了！我们现在进入【${PHASES[index].name}】阶段。准备好了吗？我们继续！`;
    setMessages(prev => [...prev, { role: 'model', content: transitionMsg }]);
  };

  // Welcome Screen
  if (currentPhaseIndex === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="w-20 h-20 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Bot size={40} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800 mb-2">青少年写作教练</h1>
          <p className="text-slate-500 mb-8">输入你的作文题目，让我们一起开启写作之旅！我会一步步引导你，直到你写出满意的文章。</p>
          
          <form onSubmit={handleStart} className="space-y-4">
            <div>
              <input
                type="text"
                value={essayTitle}
                onChange={(e) => setEssayTitle(e.target.value)}
                placeholder="例如：难忘的一天、我的梦想..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 text-lg"
            >
              开始挑战 <Send size={20} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Main Workspace
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header & Progress */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Bot className="text-blue-600" />
              题目：《{essayTitle}》
            </h1>
          </div>
          
          {/* Progress Stepper */}
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
                  onClick={() => handlePhaseChange(actualIndex)}
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

      {/* Main Content Split */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-140px)]">
        
        {/* Left: Chat Interface */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="bg-blue-50 px-4 py-3 border-b border-blue-100 flex items-center gap-2">
            <Bot className="text-blue-600" size={20} />
            <span className="font-medium text-blue-900">教练辅导 - 当前阶段：{currentPhase.name}</span>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.map((msg, idx) => (
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
            {isLoading && (
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
                disabled={isLoading}
                className="w-full pl-4 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
        </div>

        {/* Right: Workspace / Draft Area */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool className="text-amber-600" size={20} />
              <span className="font-medium text-amber-900">我的草稿本</span>
            </div>
            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded-md">
              {essayDraft.length} 字
            </span>
          </div>
          
          <div className="flex-1 p-4">
            <textarea
              value={essayDraft}
              onChange={(e) => setEssayDraft(e.target.value)}
              placeholder="在这里记录你的灵感、提纲和正文草稿...&#10;教练不会直接帮你写，你需要自己动手哦！"
              className="w-full h-full resize-none outline-none text-slate-700 leading-relaxed text-base placeholder:text-slate-300"
            />
          </div>
        </div>

      </main>
    </div>
  );
}
