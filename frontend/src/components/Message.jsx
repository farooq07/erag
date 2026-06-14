import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, FileText, ScanLine, BookOpen, Workflow } from "lucide-react";
import ThinkingLine from "./ThinkingLine";

export default function Message({ msg, query, onOpenSource, onOpenPipeline }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-5 user-pop">
        <div className="max-w-[78%] bg-indigo-500/15 dark:bg-indigo-600/20 border border-indigo-500/30 dark:border-indigo-500/20 text-indigo-950 dark:text-white/85 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed shadow-lg shadow-indigo-900/10 dark:shadow-indigo-900/20">
          {msg.content}
        </div>
      </div>
    );
  }

  const isThinking = msg.streaming && !msg.content;

  return (
    <div className="flex gap-3 mb-5 msg-in">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 flex-shrink-0 flex items-center justify-center mt-0.5 shadow-glow">
        <span className="text-white text-[10px] font-bold">AI</span>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        {/* Answer */}
        <div className="prose text-sm text-white/80 leading-relaxed">
          {isThinking ? (
            <ThinkingLine sources={msg.sources} />
          ) : (
            <>
              <ReactMarkdown>{msg.content || " "}</ReactMarkdown>
              {msg.streaming && <span className="cursor" />}
            </>
          )}
        </div>

        {/* Smart citations */}
        {msg.sources?.length > 0 && !msg.streaming && (
          <div className="mt-3">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSources((s) => !s)}
                className="flex items-center gap-1.5 text-[11px] text-faded hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10 -mx-2"
              >
                <FileText size={11} />
                <span>{msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}</span>
                {showSources ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
              </button>
              {onOpenPipeline && (
                <button
                  onClick={() => onOpenPipeline({ query, sources: msg.sources, scope: msg.scope })}
                  title="See how this answer was retrieved"
                  className="flex items-center gap-1.5 text-[11px] text-faded hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10"
                >
                  <Workflow size={11} />
                  <span>How it was retrieved</span>
                </button>
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

function SourceCard({ source: s, index, onOpenSource }) {
  const [expanded, setExpanded] = useState(false);
  const isPdf = s.source?.toLowerCase().endsWith(".pdf");

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-indigo-500/25 transition-colors group">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="w-5 h-5 rounded-md bg-indigo-500/15 dark:bg-indigo-600/20 text-indigo-800 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <FileText size={11} className="text-indigo-400/70 flex-shrink-0" />
        <span className="text-[11px] font-medium text-white/60 truncate flex-1" title={s.source}>
          {s.source}
        </span>

        {/* Department badge */}
        {s.department && (
          <span className="text-[10px] text-white/55 bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full flex-shrink-0">
            {s.department}
          </span>
        )}

        {/* Page badge */}
        {s.page !== "?" && (
          <span className="text-[10px] text-indigo-800 dark:text-indigo-300/60 bg-indigo-500/15 dark:bg-indigo-900/30 border border-indigo-500/30 dark:border-indigo-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
            p.{s.page}
          </span>
        )}

        {/* OCR badge */}
        {s.ocr && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400/60 bg-amber-900/20 border border-amber-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
            <ScanLine size={9} /> OCR
          </span>
        )}

        {/* Open-in-viewer button (PDFs only) */}
        {isPdf && onOpenSource && (
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSource(s); }}
            title="Open page with highlight"
            className="flex items-center gap-1 text-[10px] text-indigo-800 dark:text-indigo-300 bg-indigo-500/15 dark:bg-indigo-600/15 hover:bg-indigo-500/30 dark:hover:bg-indigo-600/30 border border-indigo-500/40 dark:border-indigo-500/30 px-1.5 py-0.5 rounded-md transition-all opacity-80 dark:opacity-70 group-hover:opacity-100"
          >
            <BookOpen size={10} /> View
          </button>
        )}

        {expanded ? <ChevronUp size={11} className="text-ghost flex-shrink-0" /> : <ChevronDown size={11} className="text-ghost flex-shrink-0" />}
      </div>

      {/* Expanded chunk text */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.04]">
          <p className="text-[11px] text-faded leading-relaxed mt-2 font-mono bg-white/[0.02] rounded-lg px-3 py-2 whitespace-pre-wrap">
            {s.chunk || s.preview}
          </p>
        </div>
      )}

      {/* Preview (always visible, collapsed) */}
      {!expanded && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] text-faded leading-relaxed line-clamp-2">{s.preview}</p>
        </div>
      )}
    </div>
  );
}
