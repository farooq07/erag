import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, MicOff, Sparkles, FileText, Zap, Shield, RotateCcw } from "lucide-react";
import Message from "./Message";

const SUGGESTIONS = [
  { icon: "📋", text: "Summarize the key policies in all documents" },
  { icon: "🔍", text: "What are the leave entitlements?" },
  { icon: "📊", text: "List all important numbers and figures mentioned" },
  { icon: "⚡", text: "What are working hours and overtime rules?" },
];

export default function ChatPanel({ messages, onSend, loading, hasDocs, onClearChat }) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
      {/* Top bar (only when messages exist) */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between px-6 py-3 border-b border-white/[0.05]">
          <span className="text-xs text-white/25">{messages.filter(m => m.role === "user").length} questions · multi-turn memory active</span>
          <button onClick={onClearChat} className="flex items-center gap-1.5 text-[11px] text-white/20 hover:text-white/50 transition-colors">
            <RotateCcw size={11} /> New chat
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
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
                    className="text-left px-4 py-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.07] hover:border-indigo-500/30 text-sm text-white/40 hover:text-white/70 transition-all">
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
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-4 pb-6 pt-3 max-w-3xl mx-auto w-full">
        <div className={`relative flex items-end rounded-2xl border transition-all shadow-card
          ${listening ? "border-indigo-500/60 bg-[#0d0d0d] shadow-glow"
            : "bg-[#0d0d0d] border-white/[0.08] focus-within:border-indigo-500/40 focus-within:shadow-glow"}`}
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
              ${listening ? "bg-red-500/20 text-red-400 animate-pulse" : "text-white/20 hover:text-white/50 hover:bg-white/[0.05]"}`}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          {/* Send button */}
          <button onClick={handleSubmit} disabled={!input.trim() || loading}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${input.trim() && !loading ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow" : "bg-white/[0.05] text-white/20 cursor-not-allowed"}`}
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
