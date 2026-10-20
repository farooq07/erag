import { useState, useRef, useEffect, useCallback } from "react";
import {
  ArrowUp, Mic, MicOff, Plus, Paperclip, FolderOpen, Building2, Check,
  FileText, Loader2, X, AlertCircle,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { DEPT_DOT } from "@/lib/departments";
import { cn } from "@/lib/utils";

/**
 * Chat input in the Grok/Gemini style: text on top, a toolbar underneath with
 * the attach (+) menu and the search scope on the left, voice and send on the right.
 * Files attached here show as chips with their live indexing status.
 */
export default function Composer({
  onSend, loading, autoFocus,
  scopeDept, scopeOptions, onScopeChange,
  canUpload, uploadDept, uploadDepartments, onUploadDeptChange, onPickFiles, onOpenFiles,
  attachments, onRemoveAttachment,
}) {
  const [input, setInput] = useState("");
  const [listening, setListening] = useState(false);
  const textareaRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [input]);

  useEffect(() => { if (autoFocus) textareaRef.current?.focus(); }, [autoFocus]);

  const submit = () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    onSend(q);
  };

  const toggleVoice = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice input requires Chrome or Edge browser."); return; }
    if (listening) { recognitionRef.current?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = false;
    rec.interimResults = true;
    rec.onresult = (e) => {
      setInput(Array.from(e.results).map((r) => r[0].transcript).join(""));
      if (e.results[e.results.length - 1].isFinal) setListening(false);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening]);

  const scopeLabel = scopeOptions.find((o) => o.value === scopeDept)?.label || scopeDept;
  const pending = attachments.some((a) => a.state === "uploading" || a.state === "indexing");

  return (
    <div
      className={cn(
        "rounded-[26px] border bg-card shadow-[0_10px_34px_-16px_rgba(0,0,0,0.35)] transition-[border-color,box-shadow] duration-200",
        listening ? "border-primary ring-2 ring-primary/25" : "border-border/80 focus-within:border-foreground/25",
      )}
    >
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((a) => (
            <AttachmentChip key={a.key} item={a} onRemove={() => onRemoveAttachment(a.key)} />
          ))}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder={listening ? "Listening…" : "Ask a question about your documents…"}
        aria-label="Message"
        rows={1}
        disabled={loading}
        className="block max-h-[200px] w-full resize-none bg-transparent px-5 pb-1 pt-4 text-[15px] leading-relaxed text-foreground placeholder:text-muted-foreground/70 focus:outline-none disabled:opacity-50"
        style={{ scrollbarWidth: "thin" }}
      />

      <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Add files and more" title="Add files and more"
                    className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground">
              <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-64 rounded-xl p-1.5">
            {canUpload ? (
              <>
                <DropdownMenuItem onSelect={onPickFiles} className="gap-3 rounded-lg py-2 text-[13px]">
                  <Paperclip strokeWidth={1.5} /> Upload files
                  <span className="ml-auto text-[11px] text-muted-foreground">PDF, Office, text</span>
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-3 rounded-lg py-2 text-[13px]">
                    <Building2 strokeWidth={1.5} /> Save to
                    <span className="ml-auto text-[11px] text-muted-foreground">{uploadDept}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="rounded-xl p-1.5">
                    <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Who can see new uploads</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={uploadDept} onValueChange={onUploadDeptChange}>
                      {uploadDepartments.map((d) => (
                        <DropdownMenuRadioItem key={d} value={d} className="gap-2 rounded-lg text-[13px]">
                          <span className={cn("h-1.5 w-1.5 rounded-full", DEPT_DOT[d])} /> {d}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : (
              <DropdownMenuLabel className="text-[12px] font-normal text-muted-foreground">Your role can't upload files</DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onOpenFiles} className="gap-3 rounded-lg py-2 text-[13px]">
              <FolderOpen strokeWidth={1.5} /> Manage documents
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={loading} aria-label={`Search scope: ${scopeLabel}`}
                    className="inline-flex h-8 max-w-[60vw] items-center gap-1.5 rounded-full border border-border/80 px-3 text-[12.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50">
              <span className={cn("h-1.5 w-1.5 flex-none rounded-full", DEPT_DOT[scopeDept])} />
              <span className="truncate">{scopeLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56 rounded-xl p-1.5">
            <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">Search in</DropdownMenuLabel>
            {scopeOptions.map((o) => (
              <DropdownMenuItem key={o.value} onSelect={() => onScopeChange(o.value)} className="gap-2 rounded-lg text-[13px]">
                <span className={cn("h-1.5 w-1.5 rounded-full", o.dotClass)} />
                {o.label}
                {o.value === scopeDept && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {pending && (
          <span className="hidden text-[11.5px] text-muted-foreground sm:inline">New files are searchable once indexed</span>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={listening ? "destructive" : "ghost"}
            size="icon"
            onClick={toggleVoice}
            aria-label={listening ? "Stop listening" : "Voice input"}
            title={listening ? "Stop listening" : "Voice input"}
            className={cn("h-9 w-9 rounded-full text-muted-foreground", listening && "animate-pulse")}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" strokeWidth={1.75} />}
          </Button>
          <Button size="icon" onClick={submit} disabled={!input.trim() || loading} aria-label="Send" title="Send"
                  className="h-9 w-9 rounded-full">
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

const STATE_LABEL = { uploading: "Uploading…", indexing: "Indexing…", ready: "Ready", failed: "Failed" };

function AttachmentChip({ item, onRemove }) {
  const { name, state, error } = item;
  return (
    <div className="group flex max-w-[260px] items-center gap-2.5 rounded-xl border bg-background py-1.5 pl-2 pr-1.5" title={error || name}>
      <span className={cn(
        "flex h-8 w-8 flex-none items-center justify-center rounded-lg",
        state === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
      )}>
        {state === "failed" ? <AlertCircle className="h-4 w-4" strokeWidth={1.5} /> : <FileText className="h-4 w-4" strokeWidth={1.5} />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium text-foreground">{name}</span>
        <span className={cn("flex items-center gap-1 text-[11px]", state === "failed" ? "text-destructive" : "text-muted-foreground")}>
          {(state === "uploading" || state === "indexing") && <Loader2 className="h-3 w-3 animate-spin" />}
          {state === "ready" && <Check className="h-3 w-3 text-emerald-500" />}
          {state === "failed" && error ? error : STATE_LABEL[state]}
        </span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${name}`}
              className="ml-1 flex h-6 w-6 flex-none items-center justify-center rounded-full text-muted-foreground opacity-60 transition hover:bg-muted hover:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
