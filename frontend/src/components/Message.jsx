import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ChevronUp, FileText, User, Bot } from "lucide-react";

export default function Message({ msg }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.role === "user";

  return (
    <div className={`flex gap-4 px-2 py-4 rounded-2xl ${isUser ? "" : "bg-white/[0.03]"}`}>
      {/* Avatar */}
      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white
        ${isUser ? "bg-white/15" : "bg-[#10a37f]"}`}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[11px] font-medium text-white/40 mb-1.5">
          {isUser ? "You" : "Assistant"}
        </p>

        {isUser ? (
          <p className="text-sm text-white/90 leading-relaxed">{msg.content}</p>
        ) : (
          <>
            <div className="prose text-sm text-white/85">
              <ReactMarkdown>{msg.content || " "}</ReactMarkdown>
              {msg.streaming && <span className="cursor" />}
            </div>

            {/* Sources */}
            {msg.sources?.length > 0 && !msg.streaming && (
              <div className="mt-3">
                <button
                  onClick={() => setShowSources((s) => !s)}
                  className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  <FileText size={11} />
                  <span>{msg.sources.length} source{msg.sources.length > 1 ? "s" : ""}</span>
                  {showSources ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                </button>

                {showSources && (
                  <div className="mt-2 space-y-2">
                    {msg.sources.map((s, i) => (
                      <div key={i} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <FileText size={11} className="text-[#10a37f]" />
                          <span className="text-xs font-medium text-white/70">{s.source}</span>
                          {s.page !== "?" && (
                            <span className="text-[10px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">
                              p.{s.page}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{s.preview}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
