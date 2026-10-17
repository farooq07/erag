import { useMemo } from "react";
import {
  Brain, Search, ListFilter, Sparkles, FileText,
  BookOpen, ScanLine, MessageSquare,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// A right-side Sheet that explains *how this answer was retrieved* — kept out of
// the chat transcript. The journey reveals one step at a time (question, each
// pipeline stage, then every ranked passage), each gliding in and stacking onto
// the rail. Ranked passages are the bridge to the documents: each opens the
// exact page in the viewer.

function rankStrength(i, total) {
  const top = 0.96;
  const floor = 0.34;
  if (total <= 1) return top;
  return top - (i / (total - 1)) * (top - floor);
}

const STAGGER_MS = 85;

export default function RagPipelinePanel({ open, data, onClose, onOpenSource }) {
  const { query, sources = [], scope } = data || {};
  const found = sources.length;

  const items = useMemo(() => {
    if (!data) return [];
    return [
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
  }, [data, scope, found, sources]);

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="flex w-[88vw] max-w-[400px] flex-col gap-0 p-0">
        <SheetHeader className="space-y-0 border-b px-5 py-4 text-left">
          <SheetTitle className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Retrieval pipeline
          </SheetTitle>
          <SheetDescription className="text-[13px] font-medium text-foreground">
            How this answer was found
          </SheetDescription>
        </SheetHeader>

        <div className="custom-scroll flex-1 overflow-y-auto px-5 py-5">
          <div className="relative" key={query}>
            {items.map((item, i) => (
              <div
                key={i}
                className="al-item relative flex gap-3.5 pb-3 last:pb-0"
                style={{ animationDelay: `${i * STAGGER_MS}ms` }}
              >
                {i > 0 && (
                  <span className="absolute left-[15px] top-[-12px] h-[27px] w-px bg-border" />
                )}
                <Node item={item} />
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
                    <div className="-mt-0.5 rounded-xl border bg-muted/50 px-3.5 py-2.5">
                      <div className="mb-1 text-[9.5px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
                        {item.label}
                      </div>
                      <p className="text-[13px] leading-relaxed text-foreground">{query}</p>
                    </div>
                  ) : (
                    <div className="pt-1">
                      <div className="text-[13px] font-medium leading-tight text-foreground">{item.label}</div>
                      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{item.body}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </SheetContent>

      <style>{`
        @keyframes al-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .al-item { animation: al-rise 560ms cubic-bezier(0.16, 1, 0.3, 1) both; will-change: transform, opacity; }
        @media (prefers-reduced-motion: reduce) { .al-item { animation: none; } }
      `}</style>
    </Sheet>
  );
}

function Node({ item }) {
  if (item.type === "passage") {
    return (
      <span className="relative z-10 flex h-[31px] w-[31px] flex-shrink-0 items-center justify-center rounded-full border bg-secondary text-[11px] font-bold text-secondary-foreground">
        {item.idx + 1}
      </span>
    );
  }
  const { Icon } = item;
  return (
    <span className="relative z-10 flex h-[31px] w-[31px] flex-shrink-0 items-center justify-center rounded-full border bg-primary text-primary-foreground">
      <Icon size={14} />
    </span>
  );
}

function PassageCard({ source: s, index, strength, delay = 0, onOpenSource }) {
  const isPdf = s.source?.toLowerCase().endsWith(".pdf");
  const pct = Math.round(strength * 100);

  return (
    <div className="group rounded-lg border bg-card transition-colors hover:border-foreground/20">
      <div className="flex items-center gap-2 px-2.5 pt-2.5">
        <FileText size={11} className="flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-[11px] font-medium text-foreground" title={s.source}>
          {s.source}
        </span>
        {s.page !== "?" && s.page != null && (
          <Badge variant="outline" className="px-1.5 py-0 text-[9.5px] font-normal">p.{s.page}</Badge>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2 px-2.5">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className="bar-grow h-full rounded-full bg-foreground"
            style={{ width: `${pct}%`, animationDelay: `${delay + 160}ms` }}
          />
        </div>
        <span className="w-9 text-right text-[9px] tabular-nums text-muted-foreground">rank {index + 1}</span>
      </div>

      <div className="px-2.5 pb-2.5 pt-2">
        <p className="line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">{s.preview}</p>
        <div className="mt-2 flex items-center gap-1.5">
          {s.department && (
            <Badge variant="secondary" className="px-1.5 py-0.5 text-[9px] font-normal">{s.department}</Badge>
          )}
          {s.ocr && (
            <Badge variant="outline" className="gap-0.5 px-1.5 py-0.5 text-[9px] font-normal">
              <ScanLine size={8} /> OCR
            </Badge>
          )}
          <span className="flex-1" />
          {isPdf && onOpenSource && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onOpenSource(s)}
              title="Open the source page with the passage highlighted"
              className="h-6 gap-1 px-2 text-[10px]"
            >
              <BookOpen size={10} /> Open page
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
