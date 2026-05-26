import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, FileText, ScanLine } from "lucide-react";

export default function Message({ msg }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end mb-5">
        <div className="max-w-[78%] bg-indigo-600/20 border border-indigo-500/20 text-white/85 rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 mb-5">
      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-400 flex-shrink-0 flex items-center justify-center mt-0.5 shadow-glow">
        <span className="text-white text-[10px] font-bold">AI</span>
      </div>

      <div className="flex-1 min-w-0 pt-0.5">
        {/* Answer */}
        <div className="prose text-sm text-white/80 leading-relaxed">
          <ReactMarkdown>{msg.content || " "}</ReactMarkdown>
          {msg.streaming && <span className="cursor" />}
        </div>

        {/* Smart citations */}
        {msg.sources?.length > 0 && !msg.streaming && (
          <div className="mt-3">
            <button
              onClick={() => setShowSources((s) => !s)}
              className="flex items-center gap-1.5 text-[11px] text-white/25 hover:text-indigo-400 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-500/10 -mx-2"
            >
              <FileText size={11} />
              <span>{msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}</span>
              {showSources ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            {showSources && (
              <div className="mt-2 space-y-2">
                {msg.sources.map((s, i) => (
                  <SourceCard key={i} source={s} index={i} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SourceCard({ source: s, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden hover:border-indigo-500/20 transition-colors">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={() => setExpanded((e) => !e)}
      >
        <span className="w-5 h-5 rounded-md bg-indigo-600/20 text-indigo-400 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
          {index + 1}
        </span>
        <FileText size={11} className="text-indigo-400/70 flex-shrink-0" />
        <span className="text-[11px] font-medium text-white/60 truncate flex-1" title={s.source}>
          {s.source}
        </span>

        {/* Page badge */}
        {s.page !== "?" && (
          <span className="text-[10px] text-indigo-300/60 bg-indigo-900/30 border border-indigo-500/20 px-2 py-0.5 rounded-full flex-shrink-0">
            p.{s.page}
          </span>
        )}

        {/* OCR badge */}
        {s.ocr && (
          <span className="flex items-center gap-1 text-[10px] text-amber-400/60 bg-amber-900/20 border border-amber-500/20 px-1.5 py-0.5 rounded-full flex-shrink-0">
            <ScanLine size={9} /> OCR
          </span>
        )}

        {expanded ? <ChevronUp size={11} className="text-white/20 flex-shrink-0" /> : <ChevronDown size={11} className="text-white/20 flex-shrink-0" />}
      </div>

      {/* Expanded chunk text with inline highlight */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-white/[0.04]">
          <p className="text-[11px] text-white/35 leading-relaxed mt-2 font-mono bg-white/[0.02] rounded-lg px-3 py-2 whitespace-pre-wrap">
            {s.chunk || s.preview}
          </p>
        </div>
      )}

      {/* Preview (always visible, collapsed) */}
      {!expanded && (
        <div className="px-3 pb-2.5">
          <p className="text-[11px] text-white/30 leading-relaxed line-clamp-2">{s.preview}</p>
        </div>
      )}
    </div>
  );
}
