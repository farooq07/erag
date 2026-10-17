import { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, FolderOpen, Settings, Trash2, Plus, X,
  ChevronRight, FileText, Sparkles, Loader2,
  Search, Tag, Building2, Pencil, Check,
} from "lucide-react";
import Dropdown, { DEPT_DOT } from "./Dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const DEPT_COLORS = {
  HR:          "bg-pink-500/15 text-pink-600 dark:text-pink-300 border-pink-500/30",
  Accounts:    "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30",
  Finance:     "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30",
  IT:          "bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30",
  Legal:       "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30",
  Operations:  "bg-orange-500/15 text-orange-600 dark:text-orange-300 border-orange-500/30",
  General:     "bg-muted text-muted-foreground border-border",
};

const deptClass = (d) => DEPT_COLORS[d] || "bg-muted text-muted-foreground border-border";

const formatSize = (n) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export default function Sidebar({
  documents, departments, allowedDepartments = [], canUpload = true, canClear = true,
  defaultDept, summaries,
  onUpload, onDelete, onUpdateMeta, onClear, model, onModelChange,
}) {
  const writableDepartments = (allowedDepartments.length ? allowedDepartments : departments);
  const [expanded, setExpanded] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [openSummary, setOpenSummary] = useState(null);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("All");
  const [uploadDept, setUploadDept] = useState(defaultDept || "General");
  const [uploadTags, setUploadTags] = useState("");
  const [editingDept, setEditingDept] = useState(null);

  useEffect(() => {
    if (writableDepartments.length === 0) return;
    if (!writableDepartments.includes(uploadDept)) {
      setUploadDept(writableDepartments.includes(defaultDept) ? defaultDept : writableDepartments[0]);
    }
    if (filterDept !== "All" && !writableDepartments.includes(filterDept)) {
      setFilterDept("All");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [writableDepartments.join(",")]);

  const handleUpload = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    setUploadMsg("");
    try {
      const tags = uploadTags.split(",").map((t) => t.trim()).filter(Boolean);
      const stats = await onUpload(acceptedFiles, { department: uploadDept, tags });
      setUploadMsg(stats.failed?.length
        ? `✗ ${stats.failed.join("; ")}`
        : `✓ ${stats.queued} queued for indexing`);
      setUploadTags("");
    } catch { setUploadMsg("Upload failed."); }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 6000);
  }, [onUpload, uploadDept, uploadTags]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: handleUpload,
    noClick: true, noKeyboard: true,
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

  const filteredDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return documents.filter((d) => {
      if (filterDept !== "All" && d.department !== filterDept) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [documents, search, filterDept]);

  const grouped = useMemo(() => {
    const g = {};
    for (const d of filteredDocs) {
      const k = d.department || "General";
      (g[k] = g[k] || []).push(d);
    }
    return g;
  }, [filteredDocs]);

  const deptCounts = useMemo(() => {
    const c = { All: documents.length };
    for (const d of documents) c[d.department] = (c[d.department] || 0) + 1;
    return c;
  }, [documents]);

  return (
    <div className="flex h-full flex-shrink-0" {...getRootProps()}>
      <input {...getInputProps()} />

      {/* Icon rail */}
      <div className="z-10 flex h-full w-14 flex-col items-center gap-1 border-r bg-card py-4">
        <div title="Office RAG" className="mb-4 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <MessageSquare size={15} strokeWidth={1.75} />
        </div>

        <NavIcon icon={<MessageSquare size={16} />} label="Chat" active={!expanded} onClick={() => { setActivePanel(null); setExpanded(false); }} />
        <NavIcon icon={<FolderOpen size={16} />} label={`Files (${documents.length})`} active={activePanel === "files"} onClick={() => togglePanel("files")} badge={documents.length} />
        <NavIcon icon={<Settings size={16} />} label="Settings" active={activePanel === "settings"} onClick={() => togglePanel("settings")} />

        <div className="flex-1" />
        {canUpload && (
          <Button onClick={open} title="Upload document" size="icon" className="mb-1 h-9 w-9 rounded-xl">
            <Plus size={16} strokeWidth={2} />
          </Button>
        )}
        {canClear && (
          <NavIcon icon={<Trash2 size={15} />} label="Clear all" onClick={() => { if (confirm("Clear all documents and chat?")) onClear(); }} danger />
        )}
      </div>

      {/* Expandable panel */}
      {expanded && (
        <div className="flex h-full w-80 flex-col border-r bg-card">
          <div className="flex items-center justify-between border-b px-4 py-4">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-foreground">
              {activePanel === "files" ? `Documents · ${documents.length}` : "Settings"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { setExpanded(false); setActivePanel(null); }}
              title="Close panel"
              className="h-7 w-7"
            >
              <ChevronRight size={14} />
            </Button>
          </div>

          {/* Files panel */}
          {activePanel === "files" && (
            <div className="flex-1 space-y-3 overflow-y-auto p-3">
              {canUpload ? (
                <div className="space-y-2 rounded-xl border bg-background p-3">
                  <label className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Building2 size={10} /> Department
                  </label>
                  <Dropdown
                    value={uploadDept}
                    onChange={setUploadDept}
                    className="w-full"
                    options={writableDepartments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] }))}
                  />

                  <label className="flex items-center gap-1.5 pt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                    <Tag size={10} /> Tags <span className="font-normal normal-case tracking-normal text-muted-foreground/70">(comma separated, optional)</span>
                  </label>
                  <Input
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g. 2024, policy, contract"
                    className="h-8 text-[11px]"
                  />

                  <div
                    onClick={open}
                    className={cn(
                      "mt-2 cursor-pointer rounded-lg border border-dashed p-3 text-center transition-colors",
                      isDragActive ? "border-foreground bg-accent" : "hover:bg-accent"
                    )}
                  >
                    <Plus size={14} className="mx-auto mb-1 text-muted-foreground" />
                    <p className="text-[11px] text-muted-foreground">
                      {uploading ? "Ingesting…" : isDragActive ? "Drop files here" : <>Drop into <span className="font-medium text-foreground">{uploadDept}</span> or click</>}
                    </p>
                    {uploading && <Loader2 size={11} className="mx-auto mt-1 animate-spin text-foreground" />}
                    {uploadMsg && <p className="mt-1.5 text-[10.5px] leading-relaxed text-foreground">{uploadMsg}</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border bg-background p-3 text-center">
                  <p className="text-[10.5px] text-muted-foreground">Read-only role · uploads disabled</p>
                </div>
              )}

              {/* Search + dept filter */}
              <div className="space-y-2">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files or tags…"
                    className="h-8 pl-7 text-[11px]"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {["All", ...writableDepartments].map((d) => (
                    <button
                      key={d}
                      onClick={() => setFilterDept(d)}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                        filterDept === d
                          ? d === "All" ? "border-foreground bg-foreground text-background" : deptClass(d)
                          : "border-border bg-background text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {d} {deptCounts[d] ? <span className="opacity-60">· {deptCounts[d]}</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grouped list */}
              {filteredDocs.length === 0
                ? <p className="py-6 text-center text-[11px] text-muted-foreground">
                    {documents.length === 0 ? "No documents yet" : "No matches"}
                  </p>
                : Object.keys(grouped).sort().map((dept) => (
                  <div key={dept} className="space-y-1.5">
                    <div className="mt-2 flex items-center gap-1.5 px-1">
                      <span className={cn("rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-widest", deptClass(dept))}>
                        {dept}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{grouped[dept].length}</span>
                    </div>
                    {grouped[dept].map((doc) => (
                      <DocCard
                        key={doc.name}
                        doc={doc}
                        departments={writableDepartments}
                        canEdit={canUpload}
                        editing={editingDept === doc.name}
                        onEdit={() => setEditingDept(doc.name)}
                        onCancelEdit={() => setEditingDept(null)}
                        onSaveMeta={async (meta) => { await onUpdateMeta(doc.name, meta); setEditingDept(null); }}
                        onDelete={() => onDelete(doc.name)}
                        openSummary={openSummary === doc.name}
                        onToggleSummary={() => setOpenSummary(openSummary === doc.name ? null : doc.name)}
                        summary={summaries[doc.name]}
                      />
                    ))}
                  </div>
                ))
              }
            </div>
          )}

          {/* Settings panel */}
          {activePanel === "settings" && (
            <div className="space-y-5 overflow-y-auto p-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">LLM Model</label>
                <Input value={model} onChange={(e) => onModelChange(e.target.value)} className="h-9 text-xs" />
                <p className="mt-1 text-[10px] text-muted-foreground">e.g. openai/gpt-oss-120b</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Departments</label>
                <div className="flex flex-wrap gap-1">
                  {departments.map((d) => (
                    <span key={d} className={cn("rounded-full border px-2 py-0.5 text-[10px]", deptClass(d))}>{d}</span>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Edit in <code className="text-foreground">config.py</code> (DEPARTMENTS)</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Pipeline</label>
                <Row label="LLM" value="Groq API" />
                <Row label="Embeddings" value="all-MiniLM-L6-v2 (local ONNX)" />
                <Row label="Search" value="BM25 + Vector (RRF)" />
                <Row label="Vector DB" value="ChromaDB (local)" />
                <Row label="OCR" value="Tesseract (if installed)" />
              </div>

              <div className="border-t pt-3">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">Privacy</label>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
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

function DocStatus({ status, error }) {
  if (status === "queued" || status === "processing") {
    return (
      <span className="flex items-center gap-1 text-[9.5px] text-muted-foreground">
        <Loader2 size={9} className="animate-spin" />
        {status === "queued" ? "Queued" : "Indexing…"}
      </span>
    );
  }
  if (status === "failed") {
    return <span className="text-[9.5px] text-destructive" title={error || ""}>Failed</span>;
  }
  return null;
}

function DocCard({
  doc, departments, canEdit = true, editing, onEdit, onCancelEdit, onSaveMeta,
  onDelete, openSummary, onToggleSummary, summary,
}) {
  const [editDept, setEditDept] = useState(doc.department);
  const [editTags, setEditTags] = useState((doc.tags || []).join(", "));

  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="group flex items-center gap-2 px-3 py-2 hover:bg-accent">
        <FileText size={12} className="flex-shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11.5px] font-medium text-foreground" title={doc.name}>{doc.name}</div>
          <div className="mt-0.5 flex items-center gap-1.5 tabular-nums">
            <DocStatus status={doc.status} error={doc.error} />
            {doc.chunks > 0 &&<span className="text-[9.5px] text-muted-foreground">{doc.chunks} chunks</span>}
            {doc.size > 0 && <span className="text-[9.5px] text-muted-foreground">· {formatSize(doc.size)}</span>}
          </div>
          {doc.tags?.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {doc.tags.map((t) => (
                <Badge key={t} variant="secondary" className="px-1.5 py-0 text-[9px] font-normal">{t}</Badge>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <button onClick={onEdit} title="Edit department / tags" className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
            <Pencil size={11} />
          </button>
        )}
        <button onClick={onToggleSummary} title="View summary" className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100">
          <Sparkles size={12} />
        </button>
        {canEdit && (
          <button onClick={onDelete} title="Delete" className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
            <X size={12} />
          </button>
        )}
      </div>

      {editing && (
        <div className="space-y-1.5 border-t bg-background px-3 pb-3 pt-2">
          <Dropdown
            value={editDept}
            onChange={setEditDept}
            className="w-full"
            options={departments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] }))}
          />
          <Input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="tags, comma separated"
            className="h-8 text-[11px]"
          />
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={onCancelEdit} className="h-7 px-2 text-[10px]">Cancel</Button>
            <Button
              size="sm"
              onClick={() => onSaveMeta({
                department: editDept,
                tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
              })}
              className="h-7 gap-1 px-2 text-[10px]"
            >
              <Check size={10} /> Save
            </Button>
          </div>
        </div>
      )}

      {openSummary && (
        <div className="border-t bg-accent/50 px-3 pb-3">
          <div className="mb-1.5 flex items-center gap-1 pt-2">
            <Sparkles size={10} className="text-foreground" />
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">AI Summary</span>
          </div>
          {summary
            ? <p className="whitespace-pre-line text-[11px] leading-relaxed text-muted-foreground">{summary}</p>
            : <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <Loader2 size={11} className="animate-spin" /> Generating summary…
              </div>
          }
        </div>
      )}
    </div>
  );
}

function NavIcon({ icon, label, active, onClick, badge, danger }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors",
        danger ? "text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          : active ? "bg-accent text-foreground ring-1 ring-border"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold tabular-nums text-primary-foreground">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-[11px] font-medium text-foreground">{value}</span>
    </div>
  );
}
