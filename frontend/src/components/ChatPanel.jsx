import { useState, useRef, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import {
  ArrowDown, SquarePen, ScrollText, CalendarDays, BarChart3, Clock, UploadCloud, FileUp,
} from "lucide-react";
import Message from "./Message";
import Composer from "./Composer";
import ThemeToggle from "./ThemeToggle";
import AccountMenu from "./AccountMenu";
import { DEPT_DOT } from "@/lib/departments";
import { UPLOAD_ACCEPT, effectiveUploadDept } from "@/lib/uploads";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  { Icon: ScrollText, title: "Summarize policies", text: "Summarize the key policies in all documents" },
  { Icon: CalendarDays, title: "Leave entitlements", text: "What are the leave entitlements?" },
  { Icon: BarChart3, title: "Key figures", text: "List all important numbers and figures mentioned" },
  { Icon: Clock, title: "Working hours", text: "What are working hours and overtime rules?" },
];

function greetingWord() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Maps a document's ingest status to the composer chip's state.
const chipState = (doc) => {
  if (!doc) return "indexing";
  if (doc.status === "ready") return "ready";
  if (doc.status === "failed") return "failed";
  return "indexing";
};

export default function ChatPanel({
  messages, onSend, loading, documents = [], onClearChat,
  departments = [], scopeDept = "All", onScopeChange, onOpenSource, onOpenPipeline,
  currentUser, onLogout,
  canUpload, defaultDept, onUpload, onOpenFiles,
}) {
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const [uploadChoice, setUploadChoice] = useState(defaultDept || "General");
  const [attachments, setAttachments] = useState([]);
  const bottomRef = useRef(null);
  const scrollRef = useRef(null);
  const uploadDept = effectiveUploadDept(uploadChoice, departments, defaultDept);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  }, []);

  useEffect(() => {
    if (!pinnedToBottom) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pinnedToBottom]);

  const jumpToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    setPinnedToBottom(true);
  };

  const attach = useCallback(async (files) => {
    if (!files.length || !canUpload) return;
    const batch = `b${Date.now()}`;
    setAttachments((a) => [...a, ...files.map((f, i) => ({ key: `${batch}-${i}`, name: f.name, state: "uploading", batch }))]);
    let result;
    try { result = await onUpload(files, { department: uploadDept, tags: [] }); }
    catch { result = { names: [], failed: ["Upload failed"] }; }
    setAttachments((a) => {
      const rest = a.filter((x) => x.batch !== batch);
      if (result.failed?.length) {
        return [...rest, ...files.map((f, i) => ({ key: `${batch}-${i}`, name: f.name, state: "failed", error: result.failed.join("; ") }))];
      }
      // The server may rename files (sanitising), so chips follow its names.
      return [...rest, ...(result.names || []).map((name) => ({ key: `${batch}-${name}`, name, doc: name }))];
    });
  }, [canUpload, onUpload, uploadDept]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: attach, accept: UPLOAD_ACCEPT, multiple: true, noClick: true, noKeyboard: true, disabled: !canUpload,
  });

  // Chips for uploaded files take their state from the live document list.
  const shownAttachments = attachments.map((a) =>
    a.doc ? { ...a, state: chipState(documents.find((d) => d.name === a.doc)), error: documents.find((d) => d.name === a.doc)?.error } : a);

  const send = (q) => {
    // Sent files have done their job; keep the ones still indexing in view.
    setAttachments((a) => a.filter((x) => x.doc && chipState(documents.find((d) => d.name === x.doc)) === "indexing"));
    onSend(q);
  };

  const scopeOptions = [
    { value: "All", label: "All departments", dotClass: DEPT_DOT.All },
    ...departments.map((d) => ({ value: d, label: d, dotClass: DEPT_DOT[d] })),
  ];

  const composer = (
    <Composer
      onSend={send}
      loading={loading}
      autoFocus={messages.length === 0}
      scopeDept={scopeDept}
      scopeOptions={scopeOptions}
      onScopeChange={onScopeChange}
      canUpload={canUpload}
      uploadDept={uploadDept}
      uploadDepartments={departments}
      onUploadDeptChange={setUploadChoice}
      onPickFiles={open}
      onOpenFiles={onOpenFiles}
      attachments={shownAttachments}
      onRemoveAttachment={(key) => setAttachments((a) => a.filter((x) => x.key !== key))}
    />
  );

  const firstName = currentUser?.name?.split(" ")[0] || "there";
  const hasDocs = documents.length > 0;

  return (
    <div {...getRootProps({ className: "relative flex h-full min-w-0 flex-1 flex-col overflow-hidden" })}>
      <input {...getInputProps()} />

      {/* Top bar */}
      <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={onClearChat} className="h-8 gap-2 rounded-full px-3 text-[12.5px] text-muted-foreground">
              <SquarePen className="h-3.5 w-3.5" strokeWidth={1.75} /> New chat
            </Button>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          {currentUser && <AccountMenu currentUser={currentUser} onLogout={onLogout} />}
          <ThemeToggle />
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex min-h-full flex-col items-center justify-center px-4 pb-16 pt-6 sm:px-6">
            <div className="w-full max-w-[720px]">
              <div className="rise rise-1 mb-8 text-center">
                <h1 className="font-display text-[clamp(1.8rem,4.2vw,2.6rem)] tracking-tight text-foreground">
                  {greetingWord()}, <span className="text-primary">{firstName}</span>
                </h1>
                <p className="mt-2 text-[14.5px] text-muted-foreground">
                  {hasDocs
                    ? `Ask anything. Answers come from ${documents.length} document${documents.length === 1 ? "" : "s"}, with sources.`
                    : "Add a document, then ask anything about it."}
                </p>
              </div>

              <div className="rise rise-2">{composer}</div>

              {hasDocs ? (
                <div className="rise rise-3 mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  {SUGGESTIONS.map(({ Icon, title, text }) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => send(text)}
                      className="group flex flex-col items-start gap-3 rounded-2xl border border-border/70 bg-card/60 p-3.5 text-left transition-colors hover:border-foreground/20 hover:bg-card"
                    >
                      <Icon className="h-[18px] w-[18px] text-muted-foreground transition-colors group-hover:text-primary" strokeWidth={1.25} />
                      <span className="text-[13px] font-medium leading-snug text-foreground">{title}</span>
                    </button>
                  ))}
                </div>
              ) : canUpload ? (
                <button
                  type="button"
                  onClick={open}
                  className="rise rise-3 mt-5 flex w-full items-center gap-4 rounded-2xl border border-dashed border-border p-5 text-left transition-colors hover:border-foreground/30 hover:bg-card"
                >
                  <FileUp className="h-6 w-6 flex-none text-muted-foreground" strokeWidth={1.25} />
                  <span>
                    <span className="block text-[14px] font-medium text-foreground">Upload your first document</span>
                    <span className="block text-[12.5px] text-muted-foreground">Or drop files anywhere here. PDF, Word, Excel, PowerPoint, text.</span>
                  </span>
                </button>
              ) : (
                <p className="rise rise-3 mt-5 text-center text-[13px] text-muted-foreground">No documents yet. Ask someone who can upload to add some.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-1 px-4 py-6">
            {messages.map((msg, i) => (
              <Message
                key={i}
                msg={msg}
                query={messages[i - 1]?.role === "user" ? messages[i - 1].content : ""}
                onOpenSource={onOpenSource}
                onOpenPipeline={onOpenPipeline}
              />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!pinnedToBottom && messages.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={jumpToBottom}
          className="msg-in absolute bottom-36 left-1/2 z-10 h-8 -translate-x-1/2 gap-1.5 rounded-full text-[11px] shadow-lg"
        >
          <ArrowDown className="h-3 w-3" /> Jump to latest
        </Button>
      )}

      {messages.length > 0 && (
        <div className="mx-auto w-full max-w-3xl px-4 pb-4 pt-2">
          {composer}
          <p className="mt-2.5 text-center text-[11px] text-muted-foreground/70">
            Answers come only from your documents. Check the cited sources.
          </p>
        </div>
      )}

      {/* Drop overlay */}
      {isDragActive && (
        <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-primary/60 bg-background/85 backdrop-blur-sm">
          <UploadCloud className="h-10 w-10 text-primary" strokeWidth={1.25} />
          <p className="text-[15px] font-medium text-foreground">Drop to add to <span className="text-primary">{uploadDept}</span></p>
          <p className="text-[12.5px] text-muted-foreground">PDF, Word, Excel, PowerPoint, Markdown or text</p>
        </div>
      )}
    </div>
  );
}
