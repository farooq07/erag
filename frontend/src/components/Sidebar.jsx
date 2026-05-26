import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, FolderOpen, Settings, Trash2, Plus, X,
  ChevronRight, ChevronDown, FileText, Sparkles, Loader2,
} from "lucide-react";

export default function Sidebar({ documents, summaries, onUpload, onDelete, onClear, model, onModelChange }) {
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [openSummary, setOpenSummary] = useState(null);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const stats = await onUpload(acceptedFiles);
      const ocr = stats.ocr_used?.length ? ` (OCR: ${stats.ocr_used.join(", ")})` : "";
      setUploadMsg(`✓ ${stats.added} added, ${stats.skipped} skipped${ocr}`);
    } catch { setUploadMsg("Upload failed."); }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 5000);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop, noClick: true, noKeyboard: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
      "text/plain": [".txt", ".md"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    multiple: true,
  });

  const togglePanel = (panel) => {
    if (activePanel === panel) { setActivePanel(null); setExpanded(false); }
    else { setActivePanel(panel); setExpanded(true); }
  };

  return (
    <div className="flex h-full flex-shrink-0" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Icon rail */}
      <div className="w-14 h-full bg-[#080808] border-r border-white/[0.06] flex flex-col items-center py-4 gap-1 z-10">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center mb-4 shadow-glow">
          <MessageSquare size={15} className="text-white" />
        </div>

        <NavIcon icon={<MessageSquare size={16} />} label="Chat" active={!expanded} onClick={() => { setActivePanel(null); setExpanded(false); }} />
        <NavIcon icon={<FolderOpen size={16} />} label={`Files (${documents.length})`} active={activePanel === "files"} onClick={() => togglePanel("files")} badge={documents.length} />
        <NavIcon icon={<Settings size={16} />} label="Settings" active={activePanel === "settings"} onClick={() => togglePanel("settings")} />

        <div className="flex-1" />
        <button onClick={open} title="Upload document"
          className="w-8 h-8 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 flex items-center justify-center text-indigo-400 hover:text-indigo-300 transition-all mb-1">
          <Plus size={15} />
        </button>
        <NavIcon icon={<Trash2 size={15} />} label="Clear all" onClick={() => { if (confirm("Clear all documents and chat?")) onClear(); }} danger />
      </div>

      {/* Expandable panel */}
      {expanded && (
        <div className="w-64 h-full bg-[#0a0a0a] border-r border-white/[0.06] flex flex-col">
          <div className="px-4 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60 uppercase tracking-widest">
              {activePanel === "files" ? `Documents (${documents.length})` : "Settings"}
            </span>
            <button onClick={() => { setExpanded(false); setActivePanel(null); }} className="text-white/25 hover:text-white/60">
              <ChevronRight size={14} />
            </button>
          </div>

          {/* ── Files panel ── */}
          {activePanel === "files" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Drop zone */}
              <div onClick={open}
                className={`border border-dashed rounded-xl p-3 text-center cursor-pointer transition-all
                  ${isDragActive ? "border-indigo-500 bg-indigo-500/10" : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]"}`}>
                <Plus size={16} className="mx-auto mb-1 text-white/25" />
                <p className="text-[11px] text-white/25">
                  {uploading ? "Ingesting…" : isDragActive ? "Drop files here" : "Click or drag to upload"}
                </p>
                {uploading && <Loader2 size={12} className="mx-auto mt-1 text-indigo-400 animate-spin" />}
                {uploadMsg && <p className="text-[11px] text-indigo-400 mt-1.5 leading-relaxed">{uploadMsg}</p>}
              </div>

              {/* File list with summaries */}
              {documents.length === 0
                ? <p className="text-[11px] text-white/20 text-center py-6">No documents yet</p>
                : documents.map((doc) => (
                  <div key={doc} className="rounded-xl border border-white/[0.05] overflow-hidden">
                    {/* File row */}
                    <div className="flex items-center gap-2 px-3 py-2 hover:bg-white/[0.03] group">
                      <FileText size={11} className="text-indigo-400/60 flex-shrink-0" />
                      <span className="text-[11px] text-white/50 truncate flex-1" title={doc}>{doc}</span>

                      {/* Summary toggle */}
                      <button
                        onClick={() => setOpenSummary(openSummary === doc ? null : doc)}
                        title="View summary"
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-indigo-400 transition-all"
                      >
                        <Sparkles size={11} />
                      </button>
                      <button
                        onClick={() => onDelete(doc)}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all ml-0.5"
                      >
                        <X size={11} />
                      </button>
                    </div>

                    {/* Auto-summary panel */}
                    {openSummary === doc && (
                      <div className="px-3 pb-3 bg-indigo-950/20 border-t border-white/[0.04]">
                        <div className="flex items-center gap-1 pt-2 mb-1.5">
                          <Sparkles size={10} className="text-indigo-400" />
                          <span className="text-[10px] text-indigo-400 uppercase tracking-widest">AI Summary</span>
                        </div>
                        {summaries[doc]
                          ? <p className="text-[11px] text-white/45 leading-relaxed whitespace-pre-line">{summaries[doc]}</p>
                          : <div className="flex items-center gap-2 text-[11px] text-white/25">
                              <Loader2 size={11} className="animate-spin" /> Generating summary…
                            </div>
                        }
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
          )}

          {/* ── Settings panel ── */}
          {activePanel === "settings" && (
            <div className="p-4 space-y-5 overflow-y-auto">
              <div>
                <label className="text-[10px] text-white/30 uppercase tracking-widest block mb-1.5">LLM Model</label>
                <input
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-white/70 focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <p className="text-[10px] text-white/20 mt-1">e.g. llama-3.3-70b-versatile</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-white/30 uppercase tracking-widest block">Pipeline</label>
                <Row label="LLM" value="Groq API" accent />
                <Row label="Embeddings" value="nomic-embed-text (local)" />
                <Row label="Search" value="BM25 + Vector (RRF)" />
                <Row label="Vector DB" value="ChromaDB (local)" />
                <Row label="OCR" value="Tesseract (if installed)" />
              </div>

              <div className="pt-3 border-t border-white/[0.06]">
                <label className="text-[10px] text-white/30 uppercase tracking-widest block mb-1.5">Privacy</label>
                <p className="text-[11px] text-white/25 leading-relaxed">
                  Documents stay on your machine. Only matched text chunks (~500 words) are sent to Groq per query.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NavIcon({ icon, label, active, onClick, badge, danger }) {
  return (
    <button onClick={onClick} title={label}
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all
        ${danger ? "text-white/20 hover:text-red-500 hover:bg-red-500/10"
          : active ? "bg-indigo-600/20 text-indigo-400" : "text-white/25 hover:text-white/60 hover:bg-white/[0.04]"}`}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-indigo-600 text-white text-[9px] flex items-center justify-center font-bold">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-white/25">{label}</span>
      <span className={`text-[11px] ${accent ? "text-indigo-400" : "text-white/40"}`}>{value}</span>
    </div>
  );
}
