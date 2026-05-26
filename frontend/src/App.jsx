import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";

const API = "http://localhost:8000";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [summaries, setSummaries] = useState({});   // { filename: summaryText }
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("llama-3.1-8b-instant");

  const fetchDocs = async () => {
    try {
      const r = await fetch(`${API}/documents`);
      const d = await r.json();
      setDocuments(d.documents || []);
    } catch {}
  };

  useEffect(() => { fetchDocs(); }, []);

  // ── Upload + auto-summary ──────────────────────────────────────────────
  const handleUpload = async (files) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    const r = await fetch(`${API}/upload`, { method: "POST", body: form });
    const d = await r.json();
    const newDocs = d.documents || [];
    setDocuments(newDocs);

    // Auto-summarize newly added files in background
    const addedNames = files.map((f) => f.name);
    addedNames.forEach(async (name) => {
      try {
        const sr = await fetch(`${API}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: name, model }),
        });
        const sd = await sr.json();
        setSummaries((prev) => ({ ...prev, [name]: sd.summary }));
      } catch {}
    });

    return d.stats;
  };

  const handleDelete = async (name) => {
    await fetch(`${API}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
    setSummaries((prev) => { const c = { ...prev }; delete c[name]; return c; });
    fetchDocs();
  };

  const handleClear = async () => {
    await fetch(`${API}/clear`, { method: "POST" });
    setDocuments([]);
    setMessages([]);
    setSummaries({});
  };

  // ── Chat with history ──────────────────────────────────────────────────
  const handleSend = async (question) => {
    const userMsg = { role: "user", content: question };
    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", content: "", sources: [], streaming: true }]);

    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, history }),
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
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], sources: payload.sources }; return c; });
          } else if (payload.type === "token") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + payload.content }; return c; });
          } else if (payload.type === "done") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], streaming: false }; return c; });
          }
        }
      }
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: "⚠️ Could not reach backend. Make sure `python main.py` is running.", streaming: false }; return c; });
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-black spotlight">
      <Sidebar
        documents={documents}
        summaries={summaries}
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
        onClearChat={() => setMessages([])}
      />
    </div>
  );
}
