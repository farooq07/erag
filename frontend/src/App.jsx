import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import PdfViewer from "./components/PdfViewer";

const API = "http://localhost:8000";

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [allDepartments, setAllDepartments] = useState([
    "HR", "Accounts", "Finance", "IT", "Legal", "Operations", "General",
  ]);
  const [allowedDepartments, setAllowedDepartments] = useState([]);
  const [defaultDept, setDefaultDept] = useState("General");

  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  const [summaries, setSummaries] = useState({});
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [scopeDept, setScopeDept] = useState("All");
  const [viewerSource, setViewerSource] = useState(null);

  // ── fetch helpers with X-User header ────────────────────────────────────
  const authedFetch = useCallback(
    (url, opts = {}) =>
      fetch(url, {
        ...opts,
        headers: {
          ...(opts.headers || {}),
          ...(currentUser ? { "X-User": currentUser.id } : {}),
        },
      }),
    [currentUser],
  );

  // ── Bootstrap: load users first ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${API}/users`);
        const d = await r.json();
        const list = d.users || [];
        setUsers(list);
        const saved = localStorage.getItem("erag.user");
        const initial = list.find((u) => u.id === saved) || list[0];
        setCurrentUser(initial || null);
      } catch {}
    })();
  }, []);

  // ── Whenever the user changes: refetch scoped data ─────────────────────
  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem("erag.user", currentUser.id);

    (async () => {
      try {
        const [dr, deptR] = await Promise.all([
          authedFetch(`${API}/documents`),
          authedFetch(`${API}/departments`),
        ]);
        const dd = await dr.json();
        const deptD = await deptR.json();
        setDocuments(dd.documents || []);
        if (deptD.departments) setAllDepartments(deptD.departments);
        if (deptD.allowed) setAllowedDepartments(deptD.allowed);
        if (deptD.default) setDefaultDept(deptD.default);

        // If current scope is no longer allowed, reset it.
        if (scopeDept !== "All" && deptD.allowed && !deptD.allowed.includes(scopeDept)) {
          setScopeDept("All");
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  // ── Mutations ──────────────────────────────────────────────────────────
  const fetchDocs = async () => {
    try {
      const r = await authedFetch(`${API}/documents`);
      const d = await r.json();
      setDocuments(d.documents || []);
    } catch {}
  };

  const handleUpload = async (files, { department, tags } = {}) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    form.append("department", department || defaultDept);
    form.append("tags", (tags || []).join(","));

    const r = await authedFetch(`${API}/upload`, { method: "POST", body: form });
    const d = await r.json();
    if (!r.ok) {
      return { added: 0, skipped: 0, failed: [d.detail || "upload failed"] };
    }
    setDocuments(d.documents || []);

    const addedNames = files.map((f) => f.name);
    addedNames.forEach(async (name) => {
      try {
        const sr = await authedFetch(`${API}/summary`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: name, model }),
        });
        const sd = await sr.json();
        if (sr.ok) setSummaries((prev) => ({ ...prev, [name]: sd.summary }));
      } catch {}
    });

    return d.stats;
  };

  const handleDelete = async (name) => {
    const r = await authedFetch(`${API}/documents/${encodeURIComponent(name)}`, { method: "DELETE" });
    if (!r.ok) { alert("Delete failed: " + (await r.json()).detail); return; }
    setSummaries((prev) => { const c = { ...prev }; delete c[name]; return c; });
    fetchDocs();
  };

  const handleUpdateMeta = async (name, { department, tags }) => {
    const r = await authedFetch(`${API}/documents/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department, tags }),
    });
    const d = await r.json();
    if (!r.ok) { alert(d.detail || "Update failed"); return; }
    if (d.documents) setDocuments(d.documents);
  };

  const handleClear = async () => {
    const r = await authedFetch(`${API}/clear`, { method: "POST" });
    if (!r.ok) { alert("Clear failed: " + (await r.json()).detail); return; }
    setDocuments([]);
    setMessages([]);
    setSummaries({});
  };

  // ── Chat ───────────────────────────────────────────────────────────────
  const handleSend = async (question) => {
    const userMsg = { role: "user", content: question };
    const history = messages.map(({ role, content }) => ({ role, content }));

    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    setMessages((m) => [...m, { role: "assistant", content: "", sources: [], streaming: true, scope: scopeDept }]);

    try {
      const res = await authedFetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, model, history, department: scopeDept }),
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
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: "⚠️ Could not reach backend.", streaming: false }; return c; });
    }
    setLoading(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-base spotlight">
      <Sidebar
        documents={documents}
        departments={allDepartments}
        allowedDepartments={allowedDepartments}
        canUpload={currentUser?.can_upload}
        canClear={currentUser?.role === "Admin"}
        defaultDept={defaultDept}
        summaries={summaries}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onUpdateMeta={handleUpdateMeta}
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
        departments={allowedDepartments}
        scopeDept={scopeDept}
        onScopeChange={setScopeDept}
        onOpenSource={setViewerSource}
        currentUser={currentUser}
        users={users}
        onUserChange={setCurrentUser}
      />
      <PdfViewer
        open={!!viewerSource}
        source={viewerSource}
        onClose={() => setViewerSource(null)}
      />
    </div>
  );
}
