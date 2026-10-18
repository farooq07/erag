import { useState, useEffect, useCallback, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import {
  X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Maximize2, ExternalLink, Loader2, FileText,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { apiFetch, authHeader } from "@/lib/session";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const API = "/api";

function pickHighlightPhrase(chunk) {
  if (!chunk) return "";
  const clean = chunk.replace(/\s+/g, " ").trim();
  const sentences = clean.split(/(?<=[.!?])\s+/);
  const target = sentences.find((s) => s.length > 25) || clean;
  const words = target.split(" ").filter((w) => w.length > 2);
  return words.slice(0, 8).join(" ").toLowerCase();
}

export default function PdfViewer({ open, source, onClose }) {
  if (!source) return null;
  const p = parseInt(source.page, 10);
  const initialPage = Number.isFinite(p) && p > 0 ? p : 1;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <PdfViewerBody
        key={`${source.source}:${initialPage}`}
        open={open}
        source={source}
        initialPage={initialPage}
        onClose={onClose}
      />
    </Dialog>
  );
}

function PdfViewerBody({ open, source, initialPage, onClose }) {
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(initialPage);
  const [scale, setScale] = useState(1.2);
  const [loadError, setLoadError] = useState(null);

  const fileUrl = source ? `${API}/files/${encodeURIComponent(source.source)}` : null;
  // /files requires auth, so pass the bearer token instead of a bare URL.
  const pdfFile = useMemo(
    () => (fileUrl ? { url: fileUrl, httpHeaders: authHeader() } : null),
    [fileUrl],
  );

  const openInNewTab = async () => {
    const res = await apiFetch(fileUrl);
    if (!res.ok) return;
    const blobUrl = URL.createObjectURL(await res.blob());
    window.open(blobUrl, "_blank");
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  };
  const isPdf = source?.source?.toLowerCase().endsWith(".pdf");
  const phrase = useMemo(() => pickHighlightPhrase(source?.chunk || source?.preview), [source]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "ArrowRight") setPage((p) => Math.min(p + 1, numPages || p));
      else if (e.key === "ArrowLeft") setPage((p) => Math.max(p - 1, 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, numPages]);

  const textRenderer = useCallback(
    (textItem) => {
      if (!phrase) return textItem.str;
      const lower = textItem.str.toLowerCase();
      const idx = lower.indexOf(phrase.split(" ")[0]);
      if (idx === -1) return textItem.str;
      const window = lower.slice(idx, idx + phrase.length + 20);
      const phraseWords = phrase.split(" ");
      const matchedWords = phraseWords.filter((w) => window.includes(w)).length;
      if (matchedWords < Math.max(2, Math.floor(phraseWords.length / 2))) return textItem.str;
      const before = textItem.str.slice(0, idx);
      const after = textItem.str.slice(idx);
      return `${before}<mark class="pdf-highlight">${after}</mark>`;
    },
    [phrase],
  );

  if (!source) return null;

  return (
    <DialogContent className="flex h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0 [&>button]:hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-5 py-3">
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-secondary">
          <FileText size={14} className="text-secondary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-foreground" title={source.source}>
            {source.source}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            {source.department && <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal">{source.department}</Badge>}
            {numPages > 0 && <span>Page {page} of {numPages}</span>}
            {phrase && <span>· highlight active</span>}
          </div>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Zoom out" onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}>
            <ZoomOut size={14} />
          </Button>
          <span className="w-10 text-center text-[10px] tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Zoom in" onClick={() => setScale((s) => Math.min(2.4, s + 0.2))}>
            <ZoomIn size={14} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Reset zoom" onClick={() => setScale(1.2)}>
            <Maximize2 size={13} />
          </Button>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Open in new tab" onClick={openInNewTab}>
            <ExternalLink size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Close (Esc)" onClick={onClose}>
            <X size={15} />
          </Button>
        </div>
      </div>

      {/* PDF area */}
      <div className="custom-scroll flex flex-1 justify-center overflow-auto bg-muted/40 p-6">
        {!isPdf ? (
          <NonPdfFallback source={source} />
        ) : loadError ? (
          <div className="mt-12 text-center text-muted-foreground">
            <p className="text-sm">Couldn't load PDF.</p>
            <p className="mt-1 text-xs">{loadError}</p>
          </div>
        ) : (
          <Document
            file={pdfFile}
            onLoadSuccess={({ numPages: n }) => setNumPages(n)}
            onLoadError={(err) => setLoadError(err.message)}
            loading={<ViewerLoading />}
            error={<div className="mt-12 text-sm text-muted-foreground">Failed to load PDF.</div>}
          >
            <Page
              pageNumber={page}
              scale={scale}
              customTextRenderer={textRenderer}
              renderAnnotationLayer={false}
              className="overflow-hidden rounded-lg shadow-xl"
            />
          </Document>
        )}
      </div>

      {/* Footer: page nav */}
      {isPdf && numPages > 0 && (
        <div className="flex items-center justify-center gap-3 border-t bg-card px-5 py-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Previous page (←)" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft size={15} />
          </Button>
          <Input
            type="number"
            min={1}
            max={numPages}
            value={page}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (Number.isFinite(v)) setPage(Math.min(Math.max(1, v), numPages));
            }}
            className="h-8 w-16 text-center text-xs"
          />
          <span className="text-xs text-muted-foreground">/ {numPages}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Next page (→)" onClick={() => setPage((p) => Math.min(numPages, p + 1))} disabled={page >= numPages}>
            <ChevronRight size={15} />
          </Button>
        </div>
      )}
      <style>{`
          .pdf-highlight {
            background: rgba(250, 204, 21, 0.55);
            color: transparent;
            border-radius: 2px;
            box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.3);
            padding: 0 1px;
            animation: hl-pulse 1.4s ease-out;
          }
          @keyframes hl-pulse {
            0%   { background: rgba(250, 204, 21, 0.9); box-shadow: 0 0 0 6px rgba(250, 204, 21, 0.4); }
            100% { background: rgba(250, 204, 21, 0.55); box-shadow: 0 0 0 2px rgba(250, 204, 21, 0.3); }
          }
        `}</style>
    </DialogContent>
  );
}

function ViewerLoading() {
  return (
    <div className="mt-20 flex flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 size={22} className="animate-spin" />
      <span className="text-xs">Loading document…</span>
    </div>
  );
}

function NonPdfFallback({ source }) {
  return (
    <div className="w-full max-w-2xl rounded-xl border bg-card p-6 text-sm text-foreground">
      <p className="mb-3 text-xs uppercase tracking-widest text-muted-foreground">Chunk preview</p>
      <p className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-muted-foreground">
        {source.chunk || source.preview}
      </p>
      <p className="mt-5 text-[11px] text-muted-foreground">
        Inline PDF viewer is only available for .pdf files. Open the source file in a new tab from the toolbar above.
      </p>
    </div>
  );
}
