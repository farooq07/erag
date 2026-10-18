import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp, Mic, MicOff, Sparkles, FileText, Zap, Shield, RotateCcw, Building2, ArrowDown, LogOut } from "lucide-react";
import Message from "./Message";
import Dropdown, { DEPT_DOT } from "./Dropdown";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  { icon: "📋", chip: "Summarize policies", text: "Summarize the key policies in all documents" },
  { icon: "🔍", chip: "Leave entitlements", text: "What are the leave entitlements?" },
  { icon: "📊", chip: "Key figures", text: "List all important numbers and figures mentioned" },
  { icon: "⚡", chip: "Working hours", text: "What are working hours and overtime rules?" },
];

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function ChatPanel({
  messages, onSend, loading, hasDocs, onClearChat,
  departments = [], scopeDept = "All", onScopeChange, onOpenSource, onOpenPipeline,
  currentUser, onLogout,
}) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

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

  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge browser."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }

    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(transcript);
      if (e.results[e.results.length - 1].isFinal) setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  const firstName = currentUser?.name?.split(" ")[0] || "there";

  // The composer lives in two places: centered in the empty state (Claude-style)
  // and pinned to the bottom once a conversation is underway.
  const composerBox = (
    <div
      className={cn(
        "relative flex items-end rounded-2xl border bg-card shadow-[0_8px_28px_-12px_rgba(0,0,0,0.18)] transition-all duration-200",
        listening
          ? "border-primary ring-2 ring-primary/25"
          : "border-border/80 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15"
      )}
    >
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        placeholder={listening ? "Listening…" : "Ask a question about your documents…  (⇧↵ for new line)"}
        rows={1}
        disabled={loading}
        className="max-h-36 flex-1 resize-none bg-transparent px-5 py-4 pr-28 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-50"
        style={{ scrollbarWidth: "none" }}
      />

      <Button
        variant={listening ? "destructive" : "ghost"}
        size="icon"
        onClick={toggleVoice}
        title={listening ? "Stop listening" : "Voice input"}
        className={cn("absolute bottom-2.5 right-14 h-9 w-9 text-muted-foreground", listening && "animate-pulse")}
      >
        {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </Button>

      <Button
        size="icon"
        onClick={handleSubmit}
        disabled={!input.trim() || loading}
        className="absolute bottom-2.5 right-2.5 h-9 w-9"
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-muted-foreground">Scope</span>
          <Dropdown
            value={scopeDept}
            onChange={onScopeChange}
            disabled={loading}
            icon={<Building2 className="h-3 w-3" />}
            options={[
              { value: "All", label: "All departments", dotClass: DEPT_DOT.All },
              ...departments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] })),
            ]}
          />
          {scopeDept !== "All" && (
            <Badge variant="secondary" className="text-[10px] font-normal">filtered</Badge>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          {messages.length > 0 && (
            <>
              <span className="hidden text-[11px] tabular-nums text-muted-foreground sm:inline">
                {messages.filter((m) => m.role === "user").length} questions
              </span>
              <Button variant="ghost" size="sm" onClick={onClearChat} className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground">
                <RotateCcw className="h-3 w-3" /> New chat
              </Button>
              <Separator orientation="vertical" className="h-5" />
            </>
          )}
          {currentUser && (
            <div className="flex items-center gap-2">
              <AccountMenu currentUser={currentUser} onLogout={onLogout} />
              <Button variant="ghost" size="icon" onClick={onLogout} title="Sign out" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                <LogOut className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto scroll-smooth">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-6 py-10">
            <div className="w-full max-w-2xl">
              {/* Greeting */}
              <div className="rise rise-1 mb-8 flex items-center justify-center gap-3">
                <Sparkles className="h-7 w-7 flex-shrink-0 text-primary" strokeWidth={1.5} />
                <h1 className="font-display text-[clamp(1.7rem,4vw,2.5rem)] tracking-tight text-foreground">
                  {greetingWord()}, <span className="text-primary">{firstName}</span>
                </h1>
              </div>

              {/* Composer — centered, the single focal point */}
              <div className="rise rise-2">{composerBox}</div>

              {/* Quick-action chips */}
              {hasDocs ? (
                <div className="rise rise-3 mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s.text}
                      onClick={() => onSend(s.text)}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                    >
                      <span className="opacity-80">{s.icon}</span>
                      {s.chip}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rise rise-3 mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><FileText className="h-3 w-3" /> PDF · Word · Excel · PPT</span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5"><Zap className="h-3 w-3" /> Groq-powered</span>
                  <span className="opacity-40">·</span>
                  <span className="flex items-center gap-1.5"><Shield className="h-3 w-3" /> Local embeddings</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-1 px-4 py-8">
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

      {/* Jump to bottom */}
      {!pinnedToBottom && messages.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={jumpToBottom}
          className="msg-in absolute bottom-28 left-1/2 z-10 h-8 -translate-x-1/2 gap-1.5 rounded-full text-[11px] shadow-lg"
        >
          <ArrowDown className="h-3 w-3" /> Jump to latest
        </Button>
      )}

      {/* Composer — pinned to the bottom once a conversation is underway */}
      {messages.length > 0 && (
        <div className="relative mx-auto w-full max-w-3xl px-4 pb-6 pt-3">
          {composerBox}
          <p className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground/45">
            Hybrid&nbsp;BM25&nbsp;+&nbsp;Vector · Multi-turn&nbsp;memory · Groq&nbsp;LLM · Local&nbsp;embeddings
          </p>
        </div>
      )}
    </div>
  );
}
