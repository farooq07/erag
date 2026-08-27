import { useState, useEffect, useCallback } from "react";
import Sidebar from "./components/Sidebar";
import ChatPanel from "./components/ChatPanel";
import PdfViewer from "./components/PdfViewer";
import RagPipelinePanel from "./components/RagPipelinePanel";
import AuthScreen from "./components/AuthScreen";
import ShortcutsModal from "./components/ShortcutsModal";
import { useToast } from "./components/Toast";

const API = "/api";

export default function App() {
  const toast = useToast();
  const [stats, setStats] = useState(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
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
  const [model, setModel] = useState("llama-3.1-8b-instant");
  const [scopeDept, setScopeDept] = useState("All");
  const [viewerSource, setViewerSource] = useState(null);
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
        const [dr, deptR, statsR] = await Promise.all([
          authedFetch(`${API}/documents`),
          authedFetch(`${API}/departments`),
          authedFetch(`${API}/stats`),
        ]);
        const dd = await dr.json();
        const deptD = await deptR.json();
        if (statsR.ok) setStats(await statsR.json());
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
    if (!r.ok) return { added: 0, skipped: 0, failed: [d.detail || "upload failed"] };
    setDocuments(d.documents || []);
    files.forEach(async ({ name }) => {
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
    if (!r.ok) { toast(`Delete failed: ${(await r.json()).detail}`, "error"); return; }
    setSummaries((prev) => { const c = { ...prev }; delete c[name]; return c; });
    fetchDocs();
    toast(`Removed ${name}`, "success");
  };

  const handleUpdateMeta = async (name, { department, tags }) => {
    const r = await authedFetch(`${API}/documents/${encodeURIComponent(name)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department, tags }),
    });
    const d = await r.json();
    if (!r.ok) { toast(d.detail || "Update failed", "error"); return; }
    if (d.documents) setDocuments(d.documents);
    toast("Document updated.", "success");
  };

  const handleClear = async () => {
    const r = await authedFetch(`${API}/clear`, { method: "POST" });
    if (!r.ok) { toast(`Clear failed: ${(await r.json()).detail}`, "error"); return; }
    setDocuments([]); setMessages([]); setSummaries({});
    toast("Corpus cleared.", "success");
  };

  /** Appends an assistant placeholder and streams the answer into it. */
  const streamAnswer = async (question, history) => {
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
          } else if (payload.type === "done") {
            setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], streaming: false }; return c; });
          }
        }
      }
    } catch {
      setMessages((m) => { const c = [...m]; c[c.length - 1] = { ...c[c.length - 1], content: "⚠️ Could not reach backend.", streaming: false }; return c; });
      toast("Could not reach the backend.", "error");
    }
    setLoading(false);
  };

  const handleSend = async (question) => {
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    await streamAnswer(question, history);
  };

  /** Re-asks the most recent question, discarding the answer it produced. */
  const handleRegenerate = async () => {
    if (loading) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    const question = messages[lastUserIdx].content;
    const kept = messages.slice(0, lastUserIdx + 1);
    const history = kept.slice(0, lastUserIdx).map(({ role, content }) => ({ role, content }));
    setMessages(kept);
    await streamAnswer(question, history);
  };

  // Auth gate: show nothing until we know if token is valid
  if (!authChecked) return null;

  // Not authenticated → show login/signup
  if (!currentUser) {
    return <AuthScreen onAuth={handleAuth} />;
  }

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
        onRegenerate={handleRegenerate}
        stats={stats}
        onShowShortcuts={() => setShowShortcuts(true)}
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
      <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
