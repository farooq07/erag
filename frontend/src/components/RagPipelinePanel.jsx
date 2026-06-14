import { useEffect, useMemo } from "react";
import {
  X, Brain, Search, ListFilter, Sparkles, FileText,
  BookOpen, ScanLine, MessageSquare,
} from "lucide-react";

// A docked right-side drawer that explains *how this answer was retrieved*.
// It is deliberately not part of the chat transcript: the conversation reads
// clean, and the retrieval mechanics live here on demand.
//
// The journey reveals one step at a time — question, then each pipeline stage,
// then every ranked passage — each springing in and stacking onto the rail
// (à la magicui's animated list). The ranked passages are the bridge to the
// source documents: each opens the exact page in the viewer.

// A coarse, honest relevance read derived from rank order. We don't surface a
// fabricated similarity score; the bar simply encodes "higher rank = stronger
// match", which is what the hybrid retriever actually returned.
function rankStrength(i, total) {
  const top = 0.96;
  const floor = 0.34;
  if (total <= 1) return top;
  return top - (i / (total - 1)) * (top - floor);
}

// Per-item entrance delay. Items all render up-front (so the panel reserves
// its full height and never reflows) and each slides into its reserved slot on
// a staggered beat — a smooth cascade rather than discrete pop-ins.
const STAGGER_MS = 85;

export default function RagPipelinePanel({ open, data, onClose, onOpenSource }) {
  // ESC closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const { query, sources = [], scope } = data || {};
  const found = sources.length;

  // Flatten the whole journey into one ordered list so it can reveal — and
  // stack — strictly one item after another.
  const items = useMemo(() => {
    if (!data) return [];
    const list = [
      { type: "question", Icon: MessageSquare, label: "Your question" },
      {
        type: "stage", Icon: Brain,
        label: "Understanding the question",
        body: "Parsed for intent and key entities, carrying earlier turns as context.",
      },
      {
        type: "stage", Icon: Search,
        label: "Searching the knowledge base",
        body: scope && scope !== "All"
          ? `Hybrid BM25 + vector search, scoped to ${scope}.`
          : "Hybrid BM25 + vector search across every indexed document.",
      },
      {
        type: "stage", Icon: ListFilter,
        label: "Ranking passages",
        body: found
          ? `${found} passage${found > 1 ? "s" : ""} kept, ordered by relevance.`
          : "No passages cleared the relevance threshold.",
      },
      ...sources.map((s, idx) => ({ type: "passage", s, idx })),
      {
        type: "stage", Icon: Sparkles,
        label: "Composing the answer",
        body: "The model writes grounded only on the passages above.",
      },
    ];
    return list;
  }, [data, scope, found, sources]);

  if (!open || !data) return null;

  return (
    <aside
      className="fixed top-0 right-0 z-40 h-full w-[88vw] max-w-[400px] bg-panel border-l border-app-2 shadow-2xl shadow-black/40 flex flex-col pipe-slide"
      role="complementary"
      aria-label="Retrieval pipeline"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-app">
        <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
          <Search size={14} className="text-indigo-300" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.24em] text-faded font-medium">
            Retrieval pipeline
          </div>
          <div className="text-[13px] text-app font-medium -mt-0.5">
            How this answer was found
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close (Esc)"
          className="w-8 h-8 rounded-lg flex items-center justify-center text-ghost hover:text-app hover:bg-surface-2 transition-colors flex-shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — the journey stacks in, one step at a time. Keyed on the query
          so opening a different answer's pipeline replays the cascade. */}
      <div className="flex-1 overflow-y-auto custom-scroll px-5 py-5">
        <div className="relative" key={query}>
          {items.map((item, i) => (
            <div
              key={i}
              className="al-item relative flex gap-3.5 pb-3 last:pb-0"
              style={{ animationDelay: `${i * STAGGER_MS}ms` }}
            >
              {/* Connector up to the previous node — comes in with the card */}
              {i > 0 && (
                <span className="absolute left-[15px] top-[-12px] h-[27px] w-px bg-gradient-to-b from-indigo-500/10 to-indigo-400/45" />
              )}

              {/* Rail node */}
              <Node item={item} />

              {/* Card */}
              <div className="min-w-0 flex-1">
                {item.type === "passage" ? (
                  <PassageCard
                    source={item.s}
                    index={item.idx}
                    strength={rankStrength(item.idx, found)}
                    delay={i * STAGGER_MS}
                    onOpenSource={onOpenSource}
                  />
                ) : item.type === "question" ? (
                  <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.07] px-3.5 py-2.5 -mt-0.5">
                    <div className="text-[9.5px] uppercase tracking-[0.22em] text-indigo-300/80 font-medium mb-1">
                      {item.label}
                    </div>
                    <p className="text-[13px] text-app leading-relaxed">{query}</p>
                  </div>
                ) : (
                  <div className="pt-1">
                    <div className="text-[13px] font-medium text-app leading-tight">
                      {item.label}
                    </div>
                    <p className="text-[11.5px] text-faded leading-snug mt-1">
                      {item.body}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pipe-slide {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .pipe-slide { animation: pipe-slide 260ms cubic-bezier(0.16, 1, 0.3, 1) both; }

        /* Smooth staggered cascade: every item is laid out up-front (no reflow)
           and glides into its reserved slot. Decelerating ease, no overshoot. */
        @keyframes al-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .al-item { animation: al-rise 560ms cubic-bezier(0.16, 1, 0.3, 1) both; will-change: transform, opacity; }

        @media (prefers-reduced-motion: reduce) {
          .pipe-slide, .al-item { animation: none; }
        }
      `}</style>
    </aside>
  );
}

function Node({ item }) {
  if (item.type === "passage") {
    return (
      <span className="relative z-10 flex-shrink-0 w-[31px] h-[31px] rounded-full bg-indigo-500/12 border border-indigo-500/35 text-indigo-300 text-[11px] font-bold flex items-center justify-center">
        {item.idx + 1}
      </span>
    );
  }
  const { Icon } = item;
  return (
    <span className="relative z-10 flex-shrink-0 w-[31px] h-[31px] rounded-full bg-indigo-500/15 border border-indigo-500/45 text-indigo-300 flex items-center justify-center">
      <Icon size={14} />
    </span>
  );
}

function PassageCard({ source: s, index, strength, delay = 0, onOpenSource }) {
  const isPdf = s.source?.toLowerCase().endsWith(".pdf");
  const pct = Math.round(strength * 100);

  return (
    <div className="rounded-lg border border-app bg-surface hover:border-indigo-500/30 transition-colors group">
      <div className="flex items-center gap-2 px-2.5 pt-2.5">
        <FileText size={11} className="text-indigo-400/70 flex-shrink-0" />
        <span className="text-[11px] font-medium text-app truncate flex-1" title={s.source}>
          {s.source}
        </span>
        {s.page !== "?" && s.page != null && (
          <span className="text-[9.5px] text-indigo-300/70 bg-indigo-500/10 border border-indigo-500/20 px-1.5 rounded-full flex-shrink-0">
            p.{s.page}
          </span>
        )}
      </div>

      {/* Relevance / rank bar */}
      <div className="px-2.5 mt-2 flex items-center gap-2">
        <div className="h-1 flex-1 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500/50 to-indigo-400 bar-grow"
            style={{ width: `${pct}%`, animationDelay: `${delay + 160}ms` }}
          />
        </div>
        <span className="text-[9px] text-faded tabular-nums w-9 text-right">rank {index + 1}</span>
      </div>

      {/* Preview + meta + open */}
      <div className="px-2.5 pb-2.5 pt-2">
        <p className="text-[10.5px] text-faded leading-relaxed line-clamp-2">{s.preview}</p>
        <div className="flex items-center gap-1.5 mt-2">
          {s.department && (
            <span className="text-[9px] text-muted-app bg-surface-2 border border-app px-1.5 py-0.5 rounded-full">
              {s.department}
            </span>
          )}
          {s.ocr && (
            <span className="flex items-center gap-0.5 text-[9px] text-amber-400/70 bg-amber-900/20 border border-amber-500/20 px-1.5 py-0.5 rounded-full">
              <ScanLine size={8} /> OCR
            </span>
          )}
          <span className="flex-1" />
          {isPdf && onOpenSource && (
            <button
              onClick={() => onOpenSource(s)}
              title="Open the source page with the passage highlighted"
              className="flex items-center gap-1 text-[10px] text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/30 border border-indigo-500/30 px-2 py-0.5 rounded-md transition-all opacity-80 group-hover:opacity-100"
            >
              <BookOpen size={10} /> Open page
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
