import { useState, useRef, useEffect } from "react";
import { Send, FileSearch } from "lucide-react";
import Message from "./Message";

const SUGGESTIONS = [
  "What is the leave policy?",
  "Summarize the latest quarterly report",
  "What are the office working hours?",
  "List all HR policies mentioned",
];

export default function ChatPanel({ messages, onSend, loading, hasDocs }) {
  const [input, setInput] = useState("");
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = () => {
    const q = input.trim();
    if (!q || loading) return;
    setInput("");
    onSend(q);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center px-6 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[#10a37f]/20 flex items-center justify-center mb-4">
              <FileSearch size={24} className="text-[#10a37f]" />
            </div>
            <h1 className="text-2xl font-semibold text-white mb-2">Office RAG</h1>
            <p className="text-white/40 text-sm mb-8 max-w-sm">
              {hasDocs
                ? "Your documents are ready. Ask anything."
                : "Upload documents in the sidebar to get started."}
            </p>
            {hasDocs && (
              <div className="grid grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onSend(s)}
                    className="text-left px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-sm text-white/60 hover:text-white/90 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto w-full px-4 py-6 space-y-1">
            {messages.map((msg, i) => (
              <Message key={i} msg={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="px-4 pb-6 pt-2 max-w-3xl mx-auto w-full">
        <div className="relative flex items-end bg-[#2f2f2f] rounded-2xl border border-white/10 focus-within:border-white/25 transition-colors shadow-lg">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question about your documents..."
            rows={1}
            className="flex-1 bg-transparent resize-none px-4 py-3.5 pr-12 text-sm text-white/90 placeholder-white/30 focus:outline-none max-h-40 leading-relaxed"
            style={{ scrollbarWidth: "none" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || loading}
            className={`absolute right-3 bottom-3 p-1.5 rounded-lg transition-all
              ${input.trim() && !loading
                ? "bg-[#10a37f] hover:bg-[#0d8f6e] text-white"
                : "bg-white/10 text-white/30 cursor-not-allowed"
              }`}
          >
            <Send size={15} />
          </button>
        </div>
        <p className="text-center text-white/20 text-[10px] mt-2">
          All processing is local · no data leaves your machine
        </p>
      </div>
    </div>
  );
}
