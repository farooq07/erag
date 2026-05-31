import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, MicOff, Sparkles, FileText, Zap, Shield, RotateCcw, Building2, ArrowDown } from "lucide-react";
import Message from "./Message";
import Dropdown, { DEPT_DOT } from "./Dropdown";
import UserPicker from "./UserPicker";

const SUGGESTIONS = [
  { icon: "📋", text: "Summarize the key policies in all documents" },
  { icon: "🔍", text: "What are the leave entitlements?" },
  { icon: "📊", text: "List all important numbers and figures mentioned" },
  { icon: "⚡", text: "What are working hours and overtime rules?" },
];

export default function ChatPanel({
  messages, onSend, loading, hasDocs, onClearChat,
  departments = [], scopeDept = "All", onScopeChange, onOpenSource,
  currentUser, users = [], onUserChange,
}) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  // Track whether the user is near the bottom — only then do we auto-scroll.
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setPinnedToBottom(distance < 80);
  }, []);

  useEffect(() => {
    if (!pinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pinnedToBottom]);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setPinnedToBottom(true);
  };

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 144) + "px";
  }, [input]);

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    onSend(q);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ── Voice input (Web Speech API) ────────────────────────────────────────
  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("Voice input requires Chrome or Edge browser.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;

    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) {
        setListening(false);
      }
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-app">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-white/30 uppercase tracking-widest">Scope</span>
          <Dropdown
            value={scopeDept}
            onChange={onScopeChange}
            disabled={loading}
            icon={<Building2 size={11} />}
            options={[
              { value: "All", label: "All departments", dotClass: DEPT_DOT.All },
              ...departments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] })),
            ]}
          />
          {scopeDept !== "All" && (
            <span className="text-[10px] text-indigo-300/70 bg-indigo-600/15 border border-indigo-500/30 px-1.5 py-0.5 rounded-full">
              filtered
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {messages.length > 0 && (
            <>
              <span className="text-[11px] text-white/25 hidden sm:inline">
                {messages.filter(m => m.role === "user").length} questions
              </span>
              <button onClick={onClearChat} className="flex items-center gap-1.5 text-[11px] text-white/20 hover:text-white/50 transition-colors">
                <RotateCcw size={11} /> New chat
              </button>
              <div className="w-px h-5 bg-white/10" />
            </>
          )}
          {currentUser && (
            <UserPicker user={currentUser} users={users} onChange={onUserChange} />
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center shadow-glow">
                <Sparkles size={28} className="text-white" />
              </div>
              <div className="absolute inset-0 rounded-2xl bg-indigo-500/20 blur-2xl -z-10 scale-150" />
            </div>
            <h1 className="text-2xl font-semibold text-white mb-2 tracking-tight">Office RAG</h1>
            <p className="text-sm text-white/30 mb-10 max-w-sm leading-relaxed">
              {hasDocs
                ? "Documents ready. Ask anything — I remember context across follow-up questions."
                : "Upload your office documents in the sidebar to get started."}
            </p>
            {hasDocs && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button key={s.text} onClick={() => onSend(s.text)}
                    className="text-left px-4 py-3.5 rounded-xl bg-surface hover:bg-surface-2 border border-app-2 hover:border-indigo-500/30 text-sm text-white/40 hover:text-white/70 transition-all">
                    <span className="mr-2">{s.icon}</span>{s.text}
                  </button>
                ))}
              </div>
            )}
            {!hasDocs && (
              <div className="flex items-center gap-6 mt-8 text-[11px] text-white/15">
                <span className="flex items-center gap-1.5"><FileText size={11} /> PDF · Word · Excel · PPT</span>
                <span className="flex items-center gap-1.5"><Zap size={11} /> Groq-powered</span>
                <span className="flex items-center gap-1.5"><Shield size={11} /> Local embeddings</span>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-1">
            {messages.map((msg, i) => <Message key={i} msg={msg} onOpenSource={onOpenSource} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Jump-to-bottom — only when scrolled up & there are messages */}
      {!pinnedToBottom && messages.length > 0 && (
        <button
          onClick={jumpToBottom}
          className="absolute left-1/2 -translate-x-1/2 bottom-28 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-panel-2/95 backdrop-blur-sm border border-app-2 text-[11px] text-white/70 hover:text-white hover:border-indigo-500/40 shadow-lg shadow-black/40 transition-all msg-in"
        >
          <ArrowDown size={12} /> Jump to latest
        </button>
      )}

      {/* Input bar */}
      <div className="px-4 pb-6 pt-3 max-w-3xl mx-auto w-full">
        <div className={`relative flex items-end rounded-2xl border transition-all shadow-card
          ${listening ? "border-indigo-500/60 bg-panel-2 shadow-glow"
            : "bg-panel-2 border-app-2 focus-within:border-indigo-500/40 focus-within:shadow-glow"}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={listening ? "Listening…" : "Ask a question about your documents… (Shift+Enter for new line)"}
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent resize-none px-4 py-4 pr-24 text-sm text-white/85 placeholder-white/20 focus:outline-none max-h-36 leading-relaxed disabled:opacity-50"
            style={{ scrollbarWidth: "none" }}
          />

          {/* Voice button */}
          <button onClick={toggleVoice} title={listening ? "Stop listening" : "Voice input"}
            className={`absolute right-12 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${listening ? "bg-red-500/20 text-red-400 animate-pulse" : "text-white/20 hover:text-white/50 hover:bg-surface-2"}`}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          {/* Send button */}
          <button onClick={handleSubmit} disabled={!input.trim() || loading}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${input.trim() && !loading ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow" : "bg-surface-2 text-white/20 cursor-not-allowed"}`}
          >
            <ArrowUp size={15} />
          </button>
        </div>
        <p className="text-center text-white/15 text-[10px] mt-2.5 tracking-wide">
          Hybrid search (BM25 + Vector) · Multi-turn memory · Groq LLM · Local embeddings
        </p>
      </div>
    </div>
  );
}
