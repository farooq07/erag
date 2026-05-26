import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";

const API = "http://localhost:8000";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("qwen2.5:3b");

  const fetchDocs = async () => {
    try {
      const r = await fetch(`${API}/documents`);
      const d = await r.json();
      setDocuments(d.documents || []);
    } catch {}
  };

  useEffect(() => { fetchDocs(); }, []);

  const handleUpload = async (files) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const r = await fetch(`${API}/upload`, { method: "POST", body: form });
    const d = await r.json();
    setDocuments(d.documents || []);
    return d.stats;
  };

  const handleDelete = async (name) => {
    await fetch(`${API}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
    fetchDocs();
  };

  const handleClear = async () => {
    await fetch(`${API}/clear`, { method: "POST" });
    setDocuments([]);
    setMessages([]);
  };

  const handleSend = async (question) => {
    const userMsg = { role: "user", content: question };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    const assistantMsg = { role: "assistant", content: "", sources: [], streaming: true };
    setMessages((m) => [...m, assistantMsg]);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.type === "sources") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], sources: payload.sources };
              return copy;
            });
          } else if (payload.type === "token") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = {
                ...copy[copy.length - 1],
                content: copy[copy.length - 1].content + payload.content,
              };
              return copy;
            });
          } else if (payload.type === "done") {
            setMessages((m) => {
              const copy = [...m];
              copy[copy.length - 1] = { ...copy[copy.length - 1], streaming: false };
              return copy;
            });
          }
        }
      }
    } catch (e) {
      setMessages((m) => {
        const copy = [...m];
        copy[copy.length - 1] = {
          ...copy[copy.length - 1],
          content: "⚠️ Could not reach backend. Make sure `python main.py` is running.",
          streaming: false,
        };
        return copy;
      });
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#212121]">
      <Sidebar
        documents={documents}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onClear={handleClear}
        model={model}
        onModelChange={setModel}
      />
      <ChatPanel
        messages={messages}
        onSend={handleSend}
        loading={loading}
        hasDocs={documents.length > 0}
      />
    </div>
  );
}
