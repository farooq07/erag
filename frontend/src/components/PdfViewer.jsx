import { useState, useEffect, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, ExternalLink, Loader2, FileText,
} from "lucide-react";

// Use the worker bundled with pdfjs-dist via Vite's URL import.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const API = "/api";

/**
 * Pick a distinctive ~8-word phrase from the chunk to highlight.
 * Falls back to the first non-trivial sentence.
 */
function pickHighlightPhrase(chunk) {
  if (!chunk) return "";
  const clean = chunk.replace(/\s+/g, " ").trim();
  // Prefer the first sentence longer than 25 chars.
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const target = sentences.find((s) => s.length > 25) || clean;
  const words = target.split(" ").filter((w) => w.length > 2);
  return words.slice(0, 8).join(" ").toLowerCase();
}

export default function PdfViewer({ open, source, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [loadError, setLoadError] = useState(null);

  const fileUrl = source ? `${API}/files/${encodeURIComponent(source.source)}` : null;
  const isPdf = source?.source?.toLowerCase().endsWith(".pdf");
  const phrase = useMemo(() => pickHighlightPhrase(source?.chunk || source?.preview), [source]);

  useEffect(() => {
    if (source) {
      const p = parseInt(source.page, 10);
      setPage(Number.isFinite(p) && p > 0 ? p : 1);
      setScale(1.2);
      setLoadError(null);
    }
  }, [source]);

  // ESC to close, arrow keys to navigate
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setPage((p) => Math.min(p + 1, numPages || p));
      else if (e.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, numPages]);

  // Custom text renderer — wraps any text item containing the phrase in <mark>.
  const textRenderer = useCallback(
    (textItem) => {
      if (!phrase) return textItem.str;
      const lower = textItem.str.toLowerCase();
      const idx = lower.indexOf(phrase.split(" ")[0]); // anchor on first word
      if (idx === -1) return textItem.str;
      // Check if a meaningful portion of the phrase exists nearby.
      const window = lower.slice(idx, idx + phrase.length + 20);
      const phraseWords = phrase.split(" ");
      const matchedWords = phraseWords.filter((w) => window.includes(w)).length;
      if (matchedWords < Math.max(2, Math.floor(phraseWords.length / 2))) return textItem.str;
      // Highlight the matching segment.
      const before = textItem.str.slice(0, idx);
      const after = textItem.str.slice(idx);
      return `${before}<mark class="pdf-highlight">${after}</mark>`;
    },
    [phrase],
  );

  if (!open || !source) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      onClick={onClose}
      style={{ animation: "fade-in 180ms ease-out" }}
    >
      <div
        className="relative w-full max-w-5xl h-[92vh] bg-panel border border-app-2 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "scale-in 200ms cubic-bezier(0.16, 1, 0.3, 1)" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-transparent">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
            <FileText size={14} className="text-indigo-300" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-white/85 font-medium truncate" title={source.source}>
              {source.source}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-white/40 mt-0.5">
              {source.department && (
                <span className="text-indigo-300/80 bg-indigo-600/15 border border-indigo-500/25 px-1.5 rounded">
                  {source.department}
                </span>
              )}
              {numPages > 0 && <span>Page {page} of {numPages}</span>}
              {phrase && <span className="text-amber-300/70">· highlight active</span>}
            </div>
          </div>

          {/* Zoom + open in new tab + close */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <IconBtn title="Zoom out" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>
              <ZoomOut size={14} />
            </IconBtn>
            <span className="text-[10px] text-white/40 w-10 text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <IconBtn title="Zoom in" onClick={() => setScale((s) => Math.min(2.4, s + 0.2))}>
              <ZoomIn size={14} />
            </IconBtn>
            <IconBtn title="Reset zoom" onClick={() => setScale(1.2)}>
              <Maximize2 size={13} />
            </IconBtn>
            <div className="w-px h-5 bg-white/10 mx-1" />
            <IconBtn title="Open in new tab" onClick={() => window.open(fileUrl, "_blank")}>
              <ExternalLink size={13} />
            </IconBtn>
            <IconBtn title="Close (Esc)" onClick={onClose} danger>
              <X size={15} />
            </IconBtn>
          </div>
        </div>

        {/* PDF area */}
        <div className="flex-1 overflow-auto bg-base custom-scroll flex justify-center p-6">
          {!isPdf ? (
            <NonPdfFallback source={source} />
          ) : loadError ? (
            <div className="text-center text-white/50 mt-12">
              <p className="text-sm">Couldn't load PDF.</p>
              <p className="text-xs text-white/30 mt-1">{loadError}</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              onLoadError={(err) => setLoadError(err.message)}
              loading={<ViewerLoading />}
              error={<div className="text-white/50 mt-12 text-sm">Failed to load PDF.</div>}
            >
              <Page
                pageNumber={page}
                scale={scale}
                customTextRenderer={textRenderer}
                renderAnnotationLayer={false}
                className="shadow-2xl shadow-black/60 rounded-lg overflow-hidden"
              />
            </Document>
          )}
        </div>

        {/* Footer: page nav */}
        {isPdf && numPages > 0 && (
          <div className="flex items-center justify-center gap-3 px-5 py-3 border-t border-app-2 bg-rail">
            <IconBtn title="Previous page (←)" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft size={15} />
            </IconBtn>
            <input
              type="number"
              min={1}
              max={numPages}
              value={page}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (Number.isFinite(v)) setPage(Math.min(Math.max(1, v), numPages));
              }}
              className="w-14 text-center bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-indigo-500/40"
            />
            <span className="text-xs text-white/35">/ {numPages}</span>
            <IconBtn title="Next page (→)" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
              <ChevronRight size={15} />
            </IconBtn>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        .pdf-highlight {
          background: rgba(251, 191, 36, 0.55);
          color: transparent;
          border-radius: 2px;
          box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.3);
          padding: 0 1px;
          animation: hl-pulse 1.4s ease-out;
        }
        @keyframes hl-pulse {
          0%   { background: rgba(251, 191, 36, 0.9); box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.4); }
          100% { background: rgba(251, 191, 36, 0.55); box-shadow: 0 0 0 2px rgba(251, 191, 36, 0.3); }
        }
        .custom-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>
    </div>
  );
}

function IconBtn({ children, onClick, title, disabled, danger }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all
        ${disabled ? "text-white/15 cursor-not-allowed"
          : danger ? "text-white/40 hover:text-red-400 hover:bg-red-500/10"
          : "text-white/50 hover:text-white/90 hover:bg-white/[0.06]"}`}
    >
      {children}
    </button>
  );
}

function ViewerLoading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-white/40 mt-20">
      <Loader2 size={22} className="animate-spin text-indigo-400" />
      <span className="text-xs">Loading document…</span>
    </div>
  );
}

function NonPdfFallback({ source }) {
  return (
    <div className="max-w-2xl w-full bg-panel-2 border border-app-2 rounded-xl p-6 text-app text-sm">
      <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Chunk preview</p>
      <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-white/65">
        {source.chunk || source.preview}
      </p>
      <p className="mt-5 text-[11px] text-white/30">
        Inline PDF viewer is only available for .pdf files. Open the source file in a new tab from the toolbar above.
      </p>
    </div>
  );
}
