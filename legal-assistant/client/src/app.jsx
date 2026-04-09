import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000";
const MAX = 2000;

const uid  = () => Math.random().toString(36).slice(2);
const fmtT = d => new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
const fmtD = d => new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

// ── Auth helpers ──────────────────────────────────────────────────────────────
function getToken()       { return localStorage.getItem("vk_token"); }
function getUser()        { const u = localStorage.getItem("vk_user"); return u ? JSON.parse(u) : null; }
function saveAuth(t, u)   { localStorage.setItem("vk_token", t); localStorage.setItem("vk_user", JSON.stringify(u)); }
function clearAuth()      { localStorage.removeItem("vk_token"); localStorage.removeItem("vk_user"); }

function authHeaders() {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

async function apiFetch(path, opts = {}) {
  const res  = await fetch(`${API}${path}`, { headers: authHeaders(), ...opts });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  LOGIN / REGISTER PAGE
// ─────────────────────────────────────────────────────────────────────────────
function AuthPage({ onAuth }) {
  const [tab,     setTab]     = useState("login");   // "login" | "register"
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [pass,    setPass]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async e => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const path = tab === "login" ? "/auth/login" : "/auth/register";
      const body = tab === "login"
        ? { email, password: pass }
        : { name, email, password: pass };

      const res  = await fetch(`${API}${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      saveAuth(data.token, data.user);
      onAuth(data.user);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-seal">⚖</div>
          <div className="auth-brand">VakilAI</div>
          <div className="auth-tagline">Indian Legal Assistant</div>
        </div>

        {/* Tabs */}
        <div className="auth-tabs">
          <button className={`atab${tab === "login"    ? " on" : ""}`} onClick={() => { setTab("login");    setError(""); }}>Sign In</button>
          <button className={`atab${tab === "register" ? " on" : ""}`} onClick={() => { setTab("register"); setError(""); }}>Create Account</button>
        </div>

        {/* Form */}
        <form className="auth-form" onSubmit={submit}>
          {tab === "register" && (
            <div className="afield">
              <label>Full Name</label>
              <input type="text" placeholder="Your full name" value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </div>
          )}
          <div className="afield">
            <label>Email Address</label>
            <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required autoFocus={tab === "login"} />
          </div>
          <div className="afield">
            <label>Password</label>
            <input type="password" placeholder={tab === "register" ? "Min. 6 characters" : "Your password"} value={pass} onChange={e => setPass(e.target.value)} required />
          </div>

          {error && <div className="auth-error">⚠ {error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Please wait…" : tab === "login" ? "Sign In →" : "Create Account →"}
          </button>
        </form>

        <div className="auth-demo">
          Demo account: <strong>demo@vakilai.com</strong> / <strong>demo123</strong>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN CHAT APP
// ─────────────────────────────────────────────────────────────────────────────
const STARTERS = [
  "What are my rights if police arrest me?",
  "How do I file an RTI application?",
  "Steps to file a consumer complaint in India",
  "Explain the divorce process under Hindu Marriage Act",
  "What is anticipatory bail and when can I get it?",
  "How to register property in India?",
];

function ChatApp({ user, onLogout }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [chatId,    setChatId]    = useState(null);
  const [history,   setHistory]   = useState([]);    // list of past chats
  const [sideOpen,  setSideOpen]  = useState(true);
  const [histLoad,  setHistLoad]  = useState(false);

  const endRef = useRef(null);
  const taRef  = useRef(null);

  // Load history on mount
  useEffect(() => { loadHistory(); }, []);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // Textarea resize
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  }, [input]);

  const loadHistory = async () => {
    setHistLoad(true);
    try {
      const data = await apiFetch("/history");
      setHistory(data.chats);
    } catch {} finally { setHistLoad(false); }
  };

  const loadChat = async (id) => {
    try {
      const data = await apiFetch(`/history/${id}`);
      setChatId(id);
      setMessages(data.chat.messages.map(m => ({ ...m, id: uid() })));
      setError(null);
    } catch (e) { setError(e.message); }
  };

  const deleteChat = async (id, e) => {
    e.stopPropagation();
    try {
      await apiFetch(`/history/${id}`, { method: "DELETE" });
      setHistory(h => h.filter(c => c.id !== id));
      if (chatId === id) newChat();
    } catch {}
  };

  const newChat = () => {
    setMessages([]); setChatId(null); setInput(""); setError(null);
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setError(null);
    setInput("");

    const userMsg = { id: uid(), role: "user", content: msg, ts: new Date().toISOString() };
    setMessages(p => [...p, userMsg]);
    setLoading(true);

    try {
      const historyToSend = messages.map(m => ({ role: m.role, content: m.content }));
      const data = await apiFetch("/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg, history: historyToSend, chatId }),
      });

      const aiMsg = { id: uid(), role: "assistant", content: data.reply, ts: new Date().toISOString() };
      setMessages(p => [...p, aiMsg]);

      // Update chatId if a new conversation was created
      if (!chatId || chatId !== data.chatId) {
        setChatId(data.chatId);
        loadHistory(); // refresh sidebar
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, chatId]);

  const handleKey = e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const logout = async () => {
    try { await apiFetch("/auth/logout", { method: "POST" }); } catch {}
    clearAuth(); onLogout();
  };

  const initials = user.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="chat-app">

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar${sideOpen ? " open" : ""}`}>
        <div className="sb-top">
          <div className="sb-logo">
            <span className="sb-seal">⚖</span>
            <span className="sb-name">VakilAI</span>
          </div>
          <button className="sb-toggle" onClick={() => setSideOpen(v => !v)} title="Toggle sidebar">
            {sideOpen ? "←" : "→"}
          </button>
        </div>

        <button className="new-chat-btn" onClick={newChat}>
          <span>＋</span> New Chat
        </button>

        <div className="sb-section-label">Chat History</div>

        <div className="history-list">
          {histLoad && <div className="hist-loading">Loading…</div>}
          {!histLoad && history.length === 0 && (
            <div className="hist-empty">No chats yet. Ask your first legal question!</div>
          )}
          {history.map(c => (
            <div
              key={c.id}
              className={`hist-item${chatId === c.id ? " active" : ""}`}
              onClick={() => loadChat(c.id)}
            >
              <div className="hi-icon">💬</div>
              <div className="hi-body">
                <div className="hi-title">{c.title}</div>
                <div className="hi-meta">{fmtD(c.createdAt)} · {c.messageCount / 2 | 0} Q&A</div>
              </div>
              <button className="hi-del" onClick={e => deleteChat(c.id, e)} title="Delete">✕</button>
            </div>
          ))}
        </div>

        <div className="sb-footer">
          <div className="sb-user">
            <div className="sb-avatar">{initials}</div>
            <div className="sb-user-info">
              <div className="sb-user-name">{user.name}</div>
              <div className="sb-user-email">{user.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={logout} title="Sign out">⏻</button>
        </div>
      </aside>

      {/* ── MAIN CHAT ── */}
      <div className="chat-main">

        {/* Top bar */}
        <div className="chat-topbar">
          <button className="topbar-toggle" onClick={() => setSideOpen(v => !v)}>☰</button>
          <div className="chat-topbar-title">
            <span className="ctl-seal">⚖</span>
            VakilAI — Indian Legal Assistant
          </div>
          <div className="topbar-right">
            {messages.length > 0 && (
              <button className="topbar-new" onClick={newChat}>＋ New Chat</button>
            )}
          </div>
        </div>

        {/* Messages area */}
        <div className="messages-area">

          {/* Welcome screen */}
          {messages.length === 0 && (
            <div className="welcome">
              <div className="wlc-seal">⚖</div>
              <h1 className="wlc-h1">How can I help you today?</h1>
              <p className="wlc-sub">
                Ask me anything about Indian law — FIR, bail, property, divorce, consumer rights, RTI, and more.
              </p>
              <div className="starters">
                {STARTERS.map((q, i) => (
                  <button key={i} className="starter-btn" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {/* Chat messages */}
          {messages.map(m => (
            <div key={m.id} className={`msg-wrap ${m.role}`}>
              <div className="msg-avatar">
                {m.role === "assistant" ? "⚖" : initials}
              </div>
              <div className="msg-content">
                <div className="msg-role">{m.role === "assistant" ? "VakilAI" : user.name}</div>
                <div className={`msg-text ${m.role}`}>
                  {m.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    : m.content}
                </div>
                <div className="msg-time">{fmtT(m.ts)}</div>
              </div>
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="msg-wrap assistant">
              <div className="msg-avatar">⚖</div>
              <div className="msg-content">
                <div className="msg-role">VakilAI</div>
                <div className="msg-text assistant">
                  <div className="typing-ind">
                    <span /><span /><span />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="msg-error">
              <span>⚠</span> {error}
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Input area */}
        <div className="input-area">
          <div className="input-wrap">
            <textarea
              ref={taRef}
              className="chat-input"
              placeholder="Ask a legal question… (Enter to send, Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              rows={1}
            />
            <button
              className="send-btn"
              onClick={() => send()}
              disabled={!input.trim() || loading}
              title="Send"
            >
              {loading
                ? <span className="loading-ring" />
                : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="18" height="18"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
              }
            </button>
          </div>
          <div className="input-foot">
            <span>VakilAI provides legal information, not legal advice. Always consult a qualified lawyer.</span>
            <span className={input.length > MAX * 0.9 ? "char-warn" : ""}>{MAX - input.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(() => getUser());

  if (!user || !getToken()) {
    return <AuthPage onAuth={u => setUser(u)} />;
  }

  return <ChatApp user={user} onLogout={() => setUser(null)} />;
}
