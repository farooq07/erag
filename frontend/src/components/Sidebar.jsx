import { useState, useCallback, useMemo, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  MessageSquare, FolderOpen, Settings, Trash2, Plus, X,
  ChevronRight, ChevronDown, FileText, Sparkles, Loader2,
  Search, Tag, Building2, Pencil, Check,
} from "lucide-react";
import Dropdown, { DEPT_DOT } from "./Dropdown";

const DEPT_COLORS = {
  HR:          "bg-pink-500/15 text-pink-300 border-pink-500/30",
  Accounts:    "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Finance:     "bg-amber-500/15 text-amber-300 border-amber-500/30",
  IT:          "bg-sky-500/15 text-sky-300 border-sky-500/30",
  Legal:       "bg-violet-500/15 text-violet-300 border-violet-500/30",
  Operations:  "bg-orange-500/15 text-orange-300 border-orange-500/30",
  General:     "bg-surface-2 text-muted-app border-app-2",
};

const deptClass = (d) => DEPT_COLORS[d] || "bg-surface-2 text-muted-app border-app-2";

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
  // Departments this user can actually pick. Falls back to all if not yet known.
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
  const [editingDept, setEditingDept] = useState(null);   // doc name being edited

  // Keep upload/filter dept in sync with the user's permissions.
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
      const ocr = stats.ocr_used?.length ? ` · OCR: ${stats.ocr_used.join(", ")}` : "";
      const failed = stats.failed?.length ? ` · ${stats.failed.length} failed` : "";
      setUploadMsg(`✓ ${stats.added} added · ${stats.skipped} skipped${ocr}${failed}`);
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

  // ── Filter + group docs ──────────────────────────────────────────────
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
      <div className="w-14 h-full bg-rail border-r border-app flex flex-col items-center py-4 gap-1 z-10">
        <div
          title="Office RAG"
          className="relative w-9 h-9 rounded-xl bg-panel-2 border border-app-2 flex items-center justify-center mb-4 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/35 via-transparent to-ember-500/30" />
          <MessageSquare size={15} className="relative text-indigo-700 dark:text-indigo-200" strokeWidth={1.75} />
          <span className="absolute -bottom-px -right-px w-2 h-2 rounded-full bg-ember-500 shadow-ember" />
        </div>

        <NavIcon icon={<MessageSquare size={16} />} label="Chat" active={!expanded} onClick={() => { setActivePanel(null); setExpanded(false); }} />
        <NavIcon icon={<FolderOpen size={16} />} label={`Files (${documents.length})`} active={activePanel === "files"} onClick={() => togglePanel("files")} badge={documents.length} />
        <NavIcon icon={<Settings size={16} />} label="Settings" active={activePanel === "settings"} onClick={() => togglePanel("settings")} />

        <div className="flex-1" />
        {canUpload && (
          <button onClick={open} title="Upload document"
            className="w-9 h-9 rounded-xl bg-indigo-600/15 dark:bg-indigo-600/25 hover:bg-indigo-600/35 dark:hover:bg-indigo-600/45 border border-indigo-500/40 flex items-center justify-center text-indigo-700 dark:text-indigo-200 hover:text-indigo-900 dark:hover:text-white transition-all mb-1 shadow-glow">
            <Plus size={16} strokeWidth={2} />
          </button>
        )}
        {canClear && (
          <NavIcon icon={<Trash2 size={15} />} label="Clear all" onClick={() => { if (confirm("Clear all documents and chat?")) onClear(); }} danger />
        )}
      </div>

      {/* Expandable panel */}
      {expanded && (
        <div className="w-80 h-full bg-panel border-r border-app flex flex-col">
          <div className="px-4 py-4 border-b border-app flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="h-px w-5 bg-ember-500/70" />
              <span className="text-[10.5px] font-semibold text-app uppercase tracking-[0.22em]">
                {activePanel === "files" ? `Documents · ${documents.length}` : "Settings"}
              </span>
            </div>
            <button
              onClick={() => { setExpanded(false); setActivePanel(null); }}
              title="Close panel"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-app hover:text-app hover:bg-surface-2 transition-all"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* ── Files panel ── */}
          {activePanel === "files" && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">

              {/* Upload form (dept + tags + drop) */}
              {canUpload ? (
                <div className="rounded-xl border border-app bg-surface p-3 space-y-2">
                  <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium flex items-center gap-1.5">
                    <Building2 size={10} /> Department
                  </label>
                  <Dropdown
                    value={uploadDept}
                    onChange={setUploadDept}
                    className="w-full"
                    options={writableDepartments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] }))}
                  />

                  <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium flex items-center gap-1.5 pt-1">
                    <Tag size={10} /> Tags <span className="text-faded normal-case tracking-normal font-normal">(comma separated, optional)</span>
                  </label>
                  <input
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g. 2024, policy, contract"
                    className="w-full bg-panel-2 border border-app-2 rounded-lg px-2.5 py-1.5 text-[11px] text-app placeholder:text-vanish focus:outline-none focus:border-indigo-500/50"
                  />

                  <div onClick={open}
                    className={`mt-2 border border-dashed rounded-lg p-3 text-center cursor-pointer transition-all
                      ${isDragActive ? "border-indigo-500 bg-indigo-500/10" : "border-app-2 hover:border-strong hover:bg-surface-2"}`}>
                    <Plus size={14} className="mx-auto mb-1 text-muted-app" />
                    <p className="text-[11px] text-muted-app">
                      {uploading ? "Ingesting…" : isDragActive ? "Drop files here" : <>Drop into <span className="text-app font-medium">{uploadDept}</span> or click</>}
                    </p>
                    {uploading && <Loader2 size={11} className="mx-auto mt-1 text-indigo-400 animate-spin" />}
                    {uploadMsg && <p className="text-[10.5px] text-ember-500 mt-1.5 leading-relaxed">{uploadMsg}</p>}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-app bg-surface p-3 text-center">
                  <p className="text-[10.5px] text-faded">Read-only role · uploads disabled</p>
                </div>
              )}

              {/* Search + dept filter */}
              <div className="space-y-2">
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ghost" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files or tags…"
                    className="w-full bg-surface border border-app rounded-lg pl-7 pr-2 py-1.5 text-[11px] text-app placeholder:text-ghost focus:outline-none focus:border-indigo-500/40"
                  />
                </div>
                <div className="flex flex-wrap gap-1">
                  {["All", ...writableDepartments].map((d) => (
                    <button key={d} onClick={() => setFilterDept(d)}
                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all
                        ${filterDept === d
                          ? d === "All" ? "bg-indigo-500/20 dark:bg-indigo-600/30 text-indigo-800 dark:text-indigo-200 border-indigo-500/40"
                            : deptClass(d)
                          : "bg-surface text-faded border-app hover:text-muted-app"}`}
                    >
                      {d} {deptCounts[d] ? <span className="opacity-60">· {deptCounts[d]}</span> : null}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grouped file list */}
              {filteredDocs.length === 0
                ? <p className="text-[11px] text-ghost text-center py-6">
                    {documents.length === 0 ? "No documents yet" : "No matches"}
                  </p>
                : Object.keys(grouped).sort().map((dept) => (
                  <div key={dept} className="space-y-1.5">
                    <div className="flex items-center gap-1.5 mt-2 px-1">
                      <span className={`text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${deptClass(dept)}`}>
                        {dept}
                      </span>
                      <span className="text-[10px] text-ghost">{grouped[dept].length}</span>
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
                        onSaveMeta={async (meta) => {
                          await onUpdateMeta(doc.name, meta);
                          setEditingDept(null);
                        }}
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

          {/* ── Settings panel ── */}
          {activePanel === "settings" && (
            <div className="p-4 space-y-5 overflow-y-auto">
              <div>
                <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium block mb-1.5">LLM Model</label>
                <input
                  value={model}
                  onChange={(e) => onModelChange(e.target.value)}
                  className="w-full bg-surface border border-app-2 rounded-lg px-3 py-2 text-xs text-app focus:outline-none focus:border-indigo-500/50 transition-colors"
                />
                <p className="text-[10px] text-ghost mt-1">e.g. llama-3.3-70b-versatile</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium block">Departments</label>
                <div className="flex flex-wrap gap-1">
                  {departments.map((d) => (
                    <span key={d} className={`text-[10px] px-2 py-0.5 rounded-full border ${deptClass(d)}`}>{d}</span>
                  ))}
                </div>
                <p className="text-[10px] text-ghost mt-1">Edit in <code className="text-faded">config.py</code> (DEPARTMENTS)</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium block">Pipeline</label>
                <Row label="LLM" value="Groq API" accent />
                <Row label="Embeddings" value="nomic-embed-text (local)" />
                <Row label="Search" value="BM25 + Vector (RRF)" />
                <Row label="Vector DB" value="ChromaDB (local)" />
                <Row label="OCR" value="Tesseract (if installed)" />
              </div>

              <div className="pt-3 border-t border-app">
                <label className="text-[10px] text-muted-app uppercase tracking-[0.2em] font-medium block mb-1.5">Privacy</label>
                <p className="text-[11.5px] text-muted-app leading-relaxed">
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

function DocCard({
  doc, departments, canEdit = true, editing, onEdit, onCancelEdit, onSaveMeta,
  onDelete, openSummary, onToggleSummary, summary,
}) {
  const [editDept, setEditDept] = useState(doc.department);
  const [editTags, setEditTags] = useState((doc.tags || []).join(", "));

  return (
    <div className="rounded-xl border border-app overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-2 group">
        <FileText size={12} className="text-indigo-300 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] text-app truncate font-medium" title={doc.name}>{doc.name}</div>
          <div className="flex items-center gap-1.5 mt-0.5 tabular-nums">
            {doc.chunks > 0 && <span className="text-[9.5px] text-muted-app">{doc.chunks} chunks</span>}
            {doc.size > 0 && <span className="text-[9.5px] text-muted-app">· {formatSize(doc.size)}</span>}
          </div>
          {doc.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {doc.tags.map((t) => (
                <span key={t} className="text-[9px] px-1.5 py-0 rounded bg-surface-2 text-muted-app border border-app-2">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {canEdit && (
          <button onClick={onEdit} title="Edit department / tags"
            className="opacity-0 group-hover:opacity-100 text-muted-app hover:text-indigo-300 transition-all">
            <Pencil size={11} />
          </button>
        )}
        <button onClick={onToggleSummary} title="View summary"
          className="opacity-0 group-hover:opacity-100 text-muted-app hover:text-ember-500 transition-all">
          <Sparkles size={12} />
        </button>
        {canEdit && (
          <button onClick={onDelete} title="Delete"
            className="opacity-0 group-hover:opacity-100 text-muted-app hover:text-red-400 transition-all">
            <X size={12} />
          </button>
        )}
      </div>

      {editing && (
        <div className="px-3 pb-3 pt-2 border-t border-white/[0.04] bg-surface space-y-1.5">
          <Dropdown
            value={editDept}
            onChange={setEditDept}
            className="w-full"
            options={departments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] }))}
          />
          <input
            value={editTags}
            onChange={(e) => setEditTags(e.target.value)}
            placeholder="tags, comma separated"
            className="w-full bg-panel-2 border border-app-2 rounded-md px-2 py-1 text-[11px] text-app placeholder:text-vanish focus:outline-none focus:border-indigo-500/50"
          />
          <div className="flex gap-1 justify-end">
            <button onClick={onCancelEdit}
              className="text-[10px] text-faded hover:text-app px-2 py-1">Cancel</button>
            <button
              onClick={() => onSaveMeta({
                department: editDept,
                tags: editTags.split(",").map((t) => t.trim()).filter(Boolean),
              })}
              className="text-[10px] text-indigo-300 hover:text-indigo-200 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded px-2 py-1 flex items-center gap-1"
            >
              <Check size={10} /> Save
            </button>
          </div>
        </div>
      )}

      {openSummary && (
        <div className="px-3 pb-3 bg-indigo-950/20 border-t border-white/[0.04]">
          <div className="flex items-center gap-1 pt-2 mb-1.5">
            <Sparkles size={10} className="text-indigo-400" />
            <span className="text-[10px] text-indigo-400 uppercase tracking-widest">AI Summary</span>
          </div>
          {summary
            ? <p className="text-[11px] text-muted-app leading-relaxed whitespace-pre-line">{summary}</p>
            : <div className="flex items-center gap-2 text-[11px] text-ghost">
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
    <button onClick={onClick} title={label}
      className={`relative w-9 h-9 rounded-xl flex items-center justify-center transition-all
        ${danger ? "text-muted-app hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10"
          : active
            ? "bg-indigo-600/15 dark:bg-indigo-600/25 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/40 dark:ring-indigo-500/30"
            : "text-muted-app hover:text-app hover:bg-surface-2"}`}
    >
      {icon}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-ember-500 text-white text-[9px] flex items-center justify-center font-semibold tabular-nums shadow-ember">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-muted-app">{label}</span>
      <span className={`text-[11px] font-medium ${accent ? "text-indigo-300" : "text-app"}`}>{value}</span>
    </div>
  );
}
