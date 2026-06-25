import { X, Search, Database, Layers, Shuffle, Filter, Cpu, CheckCircle2, FileText } from "lucide-react";

const PIPELINE_STEPS = [
  { key: "rewrite",  icon: Cpu,         label: "Query Rewrite",     desc: "LLM expands and resolves the query for better recall" },
  { key: "hyde",     icon: Layers,      label: "HyDE",              desc: "Hypothetical Document Embedding for dense retrieval" },
  { key: "bm25",     icon: Search,      label: "BM25 Search",       desc: "Sparse keyword search over the full corpus" },
  { key: "vector",   icon: Database,    label: "Vector Search",     desc: "Dense semantic similarity search via nomic-embed-text" },
  { key: "rrf",      icon: Shuffle,     label: "RRF Fusion",        desc: "Reciprocal Rank Fusion merges both result lists" },
  { key: "rerank",   icon: Filter,      label: "Cross-Encoder",     desc: "ms-marco reranker scores each candidate passage" },
  { key: "crag",     icon: CheckCircle2,label: "CRAG Filter",       desc: "Low-relevance chunks filtered; low-confidence warning added" },
];

export default function RagPipelinePanel({ open, data, onClose, onOpenSource }) {
  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] max-w-full bg-panel-2 border-l border-app-2 flex flex-col z-30 shadow-2xl shadow-black/40">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-app-2 flex-shrink-0">
        <div>
          <h2 className="text-[13px] font-semibold text-white/90">Retrieval Pipeline</h2>
          <p className="text-[10px] text-faded mt-0.5">How this answer was built</p>
        </div>
        <button onClick={onClose} className="text-ghost hover:text-app p-1 rounded-lg hover:bg-white/[0.05] transition-colors">
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Query */}
        {data?.query && (
          <div className="px-5 py-4 border-b border-app-2">
            <p className="text-[10px] text-faded uppercase tracking-wider mb-1.5">Query</p>
            <p className="text-[12px] text-white/80 leading-relaxed">{data.query}</p>
            {data.scope && data.scope !== "All" && (
              <span className="inline-block mt-1.5 text-[10px] text-indigo-300 bg-indigo-600/15 border border-indigo-500/25 px-1.5 py-0.5 rounded-full">
                Scoped to {data.scope}
              </span>
            )}
          </div>
        )}

        {/* Pipeline steps */}
        <div className="px-5 py-4 border-b border-app-2">
          <p className="text-[10px] text-faded uppercase tracking-wider mb-3">Pipeline Steps</p>
          <div className="space-y-2.5">
            {PIPELINE_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-start gap-3">
                  <div className="flex flex-col items-center flex-shrink-0">
                    <div className="w-6 h-6 rounded-md bg-indigo-500/15 flex items-center justify-center">
                      <Icon size={11} className="text-indigo-400" />
                    </div>
                    {i < PIPELINE_STEPS.length - 1 && (
                      <div className="w-px h-3 bg-white/[0.06] mt-1" />
                    )}
                  </div>
                  <div className="min-w-0 pt-0.5">
                    <p className="text-[11px] font-medium text-white/75">{step.label}</p>
                    <p className="text-[10px] text-faded leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retrieved sources */}
        {data?.sources?.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[10px] text-faded uppercase tracking-wider mb-3">
              Retrieved Passages ({data.sources.length})
            </p>
            <div className="space-y-2">
              {data.sources.map((s, i) => (
                <div key={i} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 hover:border-indigo-500/20 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-4 h-4 rounded bg-indigo-500/15 text-indigo-400 text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <FileText size={10} className="text-indigo-400/60 flex-shrink-0" />
                    <span className="text-[10px] font-medium text-white/60 truncate">{s.source}</span>
                    {s.department && (
                      <span className="ml-auto text-[9px] text-white/40 bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-full flex-shrink-0">
                        {s.department}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-faded leading-relaxed line-clamp-3">{s.preview}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
