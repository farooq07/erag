import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import PdfViewer from "./components/PdfViewer";
import RagPipelinePanel from "./components/RagPipelinePanel";
import AuthScreen from "./components/AuthScreen";

const API = "/api";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("dm_token") || "");
  const [currentUser, setCurrentUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [allDepartments, setAllDepartments] = useState([
    "HR", "Accounts", "Finance", "IT", "Legal", "Operations", "General",
  ]);
  const [allowedDepartments, setAllowedDepartments] = useState([]);
  const [defaultDept, setDefaultDept] = useState("General");

  const [summaries, setSummaries] = useState({});
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("openai/gpt-oss-20b");
  const [scopeDept, setScopeDept] = useState("All");
  const [viewerSource, setViewerSource] = useState(null);
  const pendingSummaries = useRef(new Set());
  const [pipeline, setPipeline] = useState(null);

  // Build auth headers for every request
  const authHeaders = useCallback(() =>
    token ? { Authorization: `Bearer ${token}` } : {},
    [token]);

  const authedFetch = useCallback(
    (url, opts = {}) =>
      fetch(url, {
        ...opts,
        headers: { ...(opts.headers || {}), ...authHeaders() },
      }),
    [authHeaders],
  );

  // On mount: verify stored token
  useEffect(() => {
    const storedToken = localStorage.getItem("dm_token");
    if (!storedToken) { setAuthChecked(true); return; }
    fetch(`${API}/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
    }).then(async (r) => {
      if (r.ok) {
        const d = await r.json();
        setToken(storedToken);
        setCurrentUser(d.user);
      } else {
        localStorage.removeItem("dm_token");
        setToken("");
      }
    }).catch(() => {
      setToken("");
    }).finally(() => setAuthChecked(true));
  }, []);

  // After user is set: load documents and departments
  useEffect(() => {
    if (!currentUser) return;
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
        if (scopeDept !== "All" && deptD.allowed && !deptD.allowed.includes(scopeDept)) setScopeDept("All");
      } catch {}
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const handleAuth = (user, tok) => {
    setToken(tok);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("dm_token");
    setToken("");
    setCurrentUser(null);
    setMessages([]);
    setDocuments([]);
  };

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
    if (!r.ok) return { queued: 0, failed: [d.detail || "upload failed"] };
    setDocuments(d.documents || []);
    // Ingestion runs in the background; summarise each file once it's ready.
    pendingSummaries.current = new Set([...pendingSummaries.current, ...(d.queued || [])]);
    return { queued: (d.queued || []).length, failed: [] };
  };

  const fetchSummary = async (name) => {
    try {
      const sr = await authedFetch(`${API}/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: name, model }),
      });
      const sd = await sr.json();
      if (sr.ok) setSummaries((prev) => ({ ...prev, [name]: sd.summary }));
    } catch {}
  };

  // Poll while any document is still being ingested.
  const ingesting = documents.some((doc) => doc.status === "queued" || doc.status === "processing");
  useEffect(() => {
    if (!ingesting) return;
    const id = setInterval(fetchDocs, 2000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingesting]);

  useEffect(() => {
    for (const doc of documents) {
      if (!pendingSummaries.current.has(doc.name)) continue;
      if (doc.status === "ready") fetchSummary(doc.name);
      if (doc.status === "ready" || doc.status === "failed") pendingSummaries.current.delete(doc.name);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documents]);

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
    setDocuments([]); setMessages([]); setSummaries({});
  };

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
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], sources: payload.sources, pipelineScope: payload.scope }; return c; });
          } else if (payload.type === "token") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: c[c.length - 1].content + payload.content }; return c; });
          } else if (payload.type === "grounding") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], grounding: payload }; return c; });
          } else if (payload.type === "error") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: `⚠️ ${payload.message}`, streaming: false }; return c; });
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

  // Auth gate: show nothing until we know if token is valid
  if (!authChecked) return null;

  // Not authenticated → show login/signup
  if (!currentUser) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
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
        onLogout={handleLogout}
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
        onOpenPipeline={setPipeline}
        currentUser={currentUser}
        onLogout={handleLogout}
      />
      <RagPipelinePanel
        open={!!pipeline}
        data={pipeline}
        onClose={() => setPipeline(null)}
        onOpenSource={setViewerSource}
      />
      <PdfViewer
        open={!!viewerSource}
        source={viewerSource}
        onClose={() => setViewerSource(null)}
      />
    </div>
  );
}
