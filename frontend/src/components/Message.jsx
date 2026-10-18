import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, FileText, ScanLine, BookOpen, Workflow, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import ThinkingLine from "./ThinkingLine";

export default function Message({ msg, query, onOpenSource, onOpenPipeline }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="user-pop mb-5 flex justify-end">
        <div className="max-w-[78%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
          {msg.content}
        </div>
      </div>
    );
  }

  const isThinking = msg.streaming && !msg.content;

  return (
    <div className="msg-in mb-5 flex gap-3">
      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <span className="text-[10px] font-bold">AI</span>
      </div>

      <div className="min-w-0 flex-1 pt-0.5">
        {/* Answer */}
        <div className="prose text-sm leading-relaxed">
          {isThinking ? (
            <ThinkingLine sources={msg.sources} />
          ) : (
            <>
              <ReactMarkdown>{msg.content || " "}</ReactMarkdown>
              {msg.streaming && <span className="cursor" />}
            </>
          )}
        </div>

        {/* Grounding verdict */}
        {msg.grounding && !msg.streaming && <GroundingBadge grounding={msg.grounding} />}

        {/* Citations */}
        {msg.sources?.length > 0 && !msg.streaming && (
          <div className="mt-3">
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSources((s) => !s)}
                className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
              >
                <FileText className="h-3 w-3" />
                <span>{msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}</span>
                {showSources ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              </Button>
              {onOpenPipeline && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenPipeline({ query, sources: msg.sources, scope: msg.scope })}
                  title="See how this answer was retrieved"
                  className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground"
                >
                  <Workflow className="h-3 w-3" />
                  <span>How it was retrieved</span>
                </Button>
              )}
            </div>

            {showSources && (
              <div className="mt-2 space-y-2">
                {msg.sources.map((s, i) => (
                  <div key={i} className="src-in" style={{ animationDelay: `${i * 55}ms` }}>
                    <SourceCard source={s} index={i} onOpenSource={onOpenSource} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GroundingBadge({ grounding }) {
  const [expanded, setExpanded] = useState(false);
  const { score, warning, ungrounded = [] } = grounding;
  const pct = Math.round((score ?? 1) * 100);
  if (!warning && pct >= 100) return null;

  if (!warning) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400/80">
        <ShieldCheck className="h-3 w-3" /><span>Grounded ({pct}%)</span>
      </div>
    );
  }

  return (
    <div className="mt-2 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/10">
      <button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="flex-1 text-[10px] text-amber-700 dark:text-amber-300/80">
          Partial grounding ({pct}%) — {ungrounded.length} claim{ungrounded.length !== 1 ? "s" : ""} may not be in the documents
        </span>
        {expanded ? <ChevronUp className="h-2.5 w-2.5 text-amber-600/70" /> : <ChevronDown className="h-2.5 w-2.5 text-amber-600/70" />}
      </button>
      {expanded && ungrounded.length > 0 && (
        <div className="space-y-1.5 border-t border-amber-500/20 px-3 pb-3 pt-2">
          {ungrounded.map((s, i) => (
            <p key={i} className="font-mono text-[10px] leading-relaxed text-amber-700/80 dark:text-amber-200/60">• {s}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source: s, index, onOpenSource }) {
  const [expanded, setExpanded] = useState(false);
  const isPdf = s.source?.toLowerCase().endsWith(".pdf");

  return (
    <div className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-foreground/20">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center gap-2 px-3 py-2.5"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-bold text-secondary-foreground">
          {index + 1}
        </span>
        <FileText className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-[11px] font-medium text-foreground" title={s.source}>
          {s.source}
        </span>

        {s.department && (
          <Badge variant="secondary" className="px-1.5 py-0.5 text-[10px] font-normal">
            {s.department}
          </Badge>
        )}
        {s.page !== "?" && (
          <Badge variant="outline" className="px-2 py-0.5 text-[10px] font-normal">
            p.{s.page}
          </Badge>
        )}
        {s.ocr && (
          <Badge variant="outline" className="gap-1 px-1.5 py-0.5 text-[10px] font-normal">
            <ScanLine className="h-2.5 w-2.5" /> OCR
          </Badge>
        )}

        {isPdf && onOpenSource && (
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => { e.stopPropagation(); onOpenSource(s); }}
            title="Open page with highlight"
            className="h-6 gap-1 px-1.5 text-[10px]"
          >
            <BookOpen className="h-2.5 w-2.5" /> View
          </Button>
        )}

        {expanded
          ? <ChevronUp className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
          : <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />}
      </div>

      {/* Expanded chunk */}
      {expanded && (
        <div className="border-t px-3 pb-3">
          <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {s.chunk || s.preview}
          </p>
        </div>
      )}

      {/* Collapsed preview */}
      {!expanded && (
        <div className="px-3 pb-2.5">
          <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{s.preview}</p>
        </div>
      )}
    </div>
  );
}
