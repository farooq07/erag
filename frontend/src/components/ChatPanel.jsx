import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, MicOff, Sparkles, FileText, Zap, Shield, RotateCcw, Building2, ArrowDown } from "lucide-react";
import Message from "./Message";
import Dropdown, { DEPT_DOT } from "./Dropdown";
import UserPicker from "./UserPicker";
import ThemeToggle from "./ThemeToggle";

const SUGGESTIONS = [
  { icon: "📋", text: "Summarize the key policies in all documents" },
  { icon: "🔍", text: "What are the leave entitlements?" },
  { icon: "📊", text: "List all important numbers and figures mentioned" },
  { icon: "⚡", text: "What are working hours and overtime rules?" },
];

export default function ChatPanel({
  messages, onSend, loading, hasDocs, onClearChat,
  departments = [], scopeDept = "All", onScopeChange, onOpenSource, onOpenPipeline,
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
      {/* Atmospheric grid + spotlight, behind everything */}
      <div aria-hidden className="" />
      <div aria-hidden className="absolute inset-0 spotlight pointer-events-none" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between gap-3 px-6 py-3 border-b border-app">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[10px] text-faded uppercase tracking-[0.22em] font-medium">Scope</span>
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
            <span className="text-[10px] text-indigo-800 dark:text-indigo-300/80 bg-indigo-500/15 dark:bg-indigo-600/15 border border-indigo-500/40 dark:border-indigo-500/30 px-1.5 py-0.5 rounded-full tracking-wide">
              filtered
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {messages.length > 0 && (
            <>
              <span className="text-[11px] text-faded hidden sm:inline tabular-nums">
                {messages.filter(m => m.role === "user").length} questions
              </span>
              <button onClick={onClearChat} className="flex items-center gap-1.5 text-[11px] text-ghost hover:text-app transition-colors">
                <RotateCcw size={11} /> New chat
              </button>
              <div className="w-px h-5 bg-white/10" />
            </>
          )}
          {currentUser && (
            <UserPicker user={currentUser} users={users} onChange={onUserChange} />
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto scroll-smooth">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6">
            {/* Asymmetric composition: eyebrow + mark on the left of the headline,
                supporting paragraph offset under the right edge. */}
            <div className="w-full max-w-2xl">
              {/* Eyebrow */}
              <div className="flex items-center gap-3 mb-7 rise rise-1">
                <span className="h-px w-8 bg-ember-500/70" />
                <span className="text-[10.5px] text-ember-500 uppercase tracking-[0.32em] font-medium">
                  DocuMind&nbsp;·&nbsp;Retrieval&nbsp;·&nbsp;Augmented
                </span>
              </div>

              {/* Brand mark + display headline, on one row at md+ */}
              <div className="flex items-start gap-5 mb-6 rise rise-2">
                <div className="relative flex-shrink-0 mt-2">
                  {/* Slow orbiting glow */}
                  <div
                    aria-hidden
                    className="drift absolute top-1/2 left-1/2 w-28 h-28 rounded-full -z-10"
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(99,102,241,0.0), rgba(99,102,241,0.35), rgba(215,116,55,0.25), rgba(99,102,241,0.0))",
                      filter: "blur(18px)",
                    }}
                  />
                  <div className="w-14 h-14 rounded-2xl bg-panel-2 border border-app-2 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/30 via-transparent to-ember-500/25" />
                    <Sparkles size={22} className="relative text-indigo-300" strokeWidth={1.5} />
                  </div>
                </div>

                <h1 className="font-display text-display text-[clamp(3rem,7vw,5.5rem)] leading-[0.92]">
                  Ask your <span className="text-ember-500">documents</span>.
                </h1>
              </div>

              {/* Supporting paragraph */}
              <p className="text-[15px] text-muted-app max-w-lg leading-relaxed ml-[76px] mb-10 rise rise-3">
                {hasDocs
                  ? "Documents are indexed. Ask anything — context carries across follow-up questions, and citations stay one click away."
                  : "Drop PDFs, Word, Excel, or slides into the sidebar. Everything is embedded locally; only matched passages reach the LLM."}
              </p>

              {hasDocs ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 ml-[76px] max-w-xl rise rise-4">
                  {SUGGESTIONS.map((s, i) => (
                    <button
                      key={s.text}
                      onClick={() => onSend(s.text)}
                      className="group text-left px-4 py-3 rounded-xl bg-surface hover:bg-surface-2 border border-app hover:border-strong text-[13px] text-muted-app hover:text-app transition-all"
                    >
                      <span className="mr-2 opacity-80 group-hover:opacity-100 transition-opacity">{s.icon}</span>
                      {s.text}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="ml-[76px] flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-faded rise rise-4">
                  <span className="flex items-center gap-1.5"><FileText size={11} className="text-ember-500/80" /> PDF · Word · Excel · PPT</span>
                  <span className="text-vanish">·</span>
                  <span className="flex items-center gap-1.5"><Zap size={11} className="text-ember-500/80" /> Groq-powered</span>
                  <span className="text-vanish">·</span>
                  <span className="flex items-center gap-1.5"><Shield size={11} className="text-ember-500/80" /> Local embeddings</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 py-8 space-y-1">
            {messages.map((msg, i) => (
              <Message
                key={i}
                msg={msg}
                query={messages[i - 1]?.role === "user" ? messages[i - 1].content : ""}
                onOpenSource={onOpenSource}
                onOpenPipeline={onOpenPipeline}
              />
            ))}
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
      <div className="relative px-4 pb-6 pt-3 max-w-3xl mx-auto w-full">
        <div className={`relative flex items-end rounded-2xl border transition-all 
          ${listening ? "border-indigo-500/60 bg-panel-2 shadow-glow"
            : "bg-panel-2 border-app-2 focus-within:border-indigo-500/50 focus-within:shadow-glow"}`}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={listening ? "Listening…" : "Ask a question about your documents…  (⇧↵ for new line)"}
            rows={1}
            disabled={loading}
            className="flex-1 bg-transparent resize-none px-5 py-4 pr-24 text-[14px] text-app placeholder-ghost focus:outline-none max-h-36 leading-relaxed disabled:opacity-50"
            style={{ scrollbarWidth: "none" }}
          />

          {/* Voice button */}
          <button onClick={toggleVoice} title={listening ? "Stop listening" : "Voice input"}
            className={`absolute right-12 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${listening ? "bg-red-500/20 text-red-400 animate-pulse" : "text-ghost hover:text-app hover:bg-surface-2"}`}
          >
            {listening ? <MicOff size={14} /> : <Mic size={14} />}
          </button>

          {/* Send button */}
          <button onClick={handleSubmit} disabled={!input.trim() || loading}
            className={`absolute right-3 bottom-3 w-8 h-8 rounded-lg flex items-center justify-center transition-all
              ${input.trim() && !loading ? "bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow" : "bg-surface-2 text-vanish cursor-not-allowed"}`}
          >
            <ArrowUp size={15} />
          </button>
        </div>
        <p className="text-center text-vanish text-[10px] mt-2.5 tracking-[0.18em] uppercase font-medium">
          Hybrid&nbsp;BM25&nbsp;+&nbsp;Vector · Multi-turn&nbsp;memory · Groq&nbsp;LLM · Local&nbsp;embeddings
        </p>
      </div>
    </div>
  );
}
