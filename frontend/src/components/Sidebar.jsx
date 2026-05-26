import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { FileText, Trash2, Upload, Settings, X, ChevronDown } from "lucide-react";

export default function Sidebar({ documents, onUpload, onDelete, onClear, model, onModelChange }) {
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const onDrop = useCallback(async (acceptedFiles) => {
    if (!acceptedFiles.length) return;
    setUploading(true);
    setUploadMsg("Ingesting...");
    try {
      const stats = await onUpload(acceptedFiles);
      setUploadMsg(`✓ Added ${stats.added}, skipped ${stats.skipped}`);
    } catch {
      setUploadMsg("Upload failed.");
    }
    setUploading(false);
    setTimeout(() => setUploadMsg(""), 3000);
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
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

  return (
    <div className="w-64 flex-shrink-0 bg-[#171717] flex flex-col h-full border-r border-white/10">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center gap-2 border-b border-white/10">
        <div className="w-7 h-7 rounded-lg bg-[#10a37f] flex items-center justify-center text-white font-bold text-sm">R</div>
        <span className="font-semibold text-white text-sm tracking-wide">Office RAG</span>
        <span className="ml-auto text-[10px] text-white/30 bg-white/5 px-2 py-0.5 rounded-full">local</span>
      </div>

      {/* Upload zone */}
      <div className="p-3">
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all
            ${isDragActive
              ? "border-[#10a37f] bg-[#10a37f]/10"
              : "border-white/20 hover:border-white/40 hover:bg-white/5"
            }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto mb-2 text-white/40" size={20} />
          {uploading
            ? <p className="text-xs text-[#10a37f]">Ingesting...</p>
            : isDragActive
              ? <p className="text-xs text-[#10a37f]">Drop files here</p>
              : <p className="text-xs text-white/40">Drop PDF, Word, Excel,<br />PPT, TXT</p>
          }
        </div>
        {uploadMsg && (
          <p className="text-xs text-[#10a37f] mt-2 text-center">{uploadMsg}</p>
        )}
      </div>

      {/* Documents list */}
      <div className="flex-1 overflow-y-auto px-3 pb-2">
        <p className="text-[10px] uppercase tracking-wider text-white/30 mb-2 px-1">
          Documents ({documents.length})
        </p>
        {documents.length === 0 ? (
          <p className="text-xs text-white/25 text-center mt-4">No documents yet</p>
        ) : (
          <div className="space-y-1">
            {documents.map((doc) => (
              <div
                key={doc}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 group"
              >
                <FileText size={13} className="text-white/40 flex-shrink-0" />
                <span className="text-xs text-white/70 truncate flex-1" title={doc}>{doc}</span>
                <button
                  onClick={() => onDelete(doc)}
                  className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom settings */}
      <div className="border-t border-white/10 p-3 space-y-2">
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-white/50 hover:text-white/80 transition-colors text-xs"
        >
          <Settings size={13} />
          <span>Settings</span>
          <ChevronDown size={12} className={`ml-auto transition-transform ${showSettings ? "rotate-180" : ""}`} />
        </button>

        {showSettings && (
          <div className="px-2 space-y-2">
            <div>
              <label className="text-[10px] text-white/30 uppercase tracking-wider">Model</label>
              <input
                value={model}
                onChange={(e) => onModelChange(e.target.value)}
                className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white/80 focus:outline-none focus:border-[#10a37f]"
              />
            </div>
          </div>
        )}

        <button
          onClick={() => { if (confirm("Clear all documents and chat?")) onClear(); }}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-red-500/10 text-white/30 hover:text-red-400 transition-colors text-xs"
        >
          <Trash2 size={13} />
          <span>Clear everything</span>
        </button>
      </div>
    </div>
  );
}
