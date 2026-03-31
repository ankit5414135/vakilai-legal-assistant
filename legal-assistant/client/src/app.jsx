import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ─── Constants ────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_CHARS = 2000;

const SUGGESTIONS = [
  { icon: "📋", text: "What are my rights if I'm arrested by police in India?" },
  { icon: "🏠", text: "Explain tenant rights under the Rent Control Act" },
  { icon: "💼", text: "How do I file a consumer complaint in India?" },
  { icon: "⚖️", text: "What is the difference between FIR and complaint?" },
];

const TOPICS = [
  "Criminal Law & FIR",
  "Property & Land Disputes",
  "Family Law & Divorce",
  "Consumer Rights",
  "Labour & Employment",
  "RTI (Right to Information)",
  "Cyber Crime",
  "Tenant Rights",
  "Bail & Arrest",
  "Contract Law",
];

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// ─── App Component ────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId] = useState(generateSessionId);

  // PDF state
  const [pdfMeta, setPdfMeta] = useState(null); // { name, pages, characters }
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  // ── Send message ─────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;
    if (trimmed.length > MAX_CHARS) {
      setError(`Message too long. Max ${MAX_CHARS} characters.`);
      return;
    }

    setError(null);
    setInput("");

    const userMsg = {
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    // Build history array (role + content only)
    const history = messages.map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, sessionId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      const aiMsg = {
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
        tokens: data.tokens,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setError(err.message || "Failed to get a response. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, sessionId]);

  // ── Handle keyboard ──────────────────────────────────────────────────────
  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── PDF upload ───────────────────────────────────────────────────────────
  const handlePdfUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfError("File too large. Max 10MB.");
      return;
    }

    setPdfError(null);
    setIsPdfUploading(true);

    const formData = new FormData();
    formData.append("pdf", file);
    formData.append("sessionId", sessionId);

    try {
      const res = await fetch(`${API_BASE}/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Upload failed");

      setPdfMeta({
        name: file.name,
        pages: data.pages,
        characters: data.characters,
      });

      // Add a system notification message
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `📄 **Document Loaded:** *${file.name}*\n\nI've read **${data.pages} page(s)** of your legal document. You can now ask me questions about its contents and I'll provide answers based on the document.`,
          timestamp: new Date(),
          isSystem: true,
        },
      ]);
    } catch (err) {
      setPdfError(err.message || "Failed to upload PDF.");
    } finally {
      setIsPdfUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handlePdfUpload(file);
  };

  const clearPdf = async () => {
    try {
      await fetch(`${API_BASE}/clear-pdf/${sessionId}`, { method: "DELETE" });
    } catch (_) {}
    setPdfMeta(null);
    setPdfError(null);
  };

  // ── New chat ─────────────────────────────────────────────────────────────
  const startNewChat = () => {
    setMessages([]);
    setError(null);
    setInput("");
    clearPdf();
  };

  const charCount = input.length;
  const charWarn = charCount > MAX_CHARS * 0.85;
  const charError = charCount > MAX_CHARS;

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon">⚖️</div>
            <span className="logo-text">VakilAI</span>
          </div>
          <div className="logo-sub">Indian Legal Assistant</div>
        </div>

        <div className="sidebar-section">
          <button className="new-chat-btn" onClick={startNewChat}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            New Conversation
          </button>
        </div>

        {/* PDF Upload */}
        <div className="pdf-panel">
          <div className="sidebar-section-label" style={{ padding: "0 0 10px" }}>
            Upload Legal Document
          </div>

          {isPdfUploading ? (
            <div className="pdf-uploading">
              <div className="spinner" />
              Parsing document…
            </div>
          ) : pdfMeta ? (
            <div className="pdf-status">
              <div className="pdf-status-name">📄 {pdfMeta.name}</div>
              <div className="pdf-status-meta">
                {pdfMeta.pages} page{pdfMeta.pages !== 1 ? "s" : ""} · {(pdfMeta.characters / 1000).toFixed(1)}k chars
              </div>
              <button className="pdf-clear-btn" onClick={clearPdf}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
                Remove
              </button>
            </div>
          ) : (
            <div className="pdf-drop-zone">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                title="Upload PDF"
              />
              <div className="pdf-drop-icon">📎</div>
              <div className="pdf-drop-label">
                <strong>Click to upload PDF</strong><br />
                Legal docs, contracts, judgements
              </div>
            </div>
          )}

          {pdfError && (
            <div style={{ fontSize: "0.75rem", color: "#c07070", marginTop: 8 }}>
              ⚠ {pdfError}
            </div>
          )}
        </div>

        {/* Quick Topics */}
        <div className="sidebar-section-label" style={{ padding: "0 24px 8px" }}>
          Quick Topics
        </div>
        <div className="topics-list">
          {TOPICS.map((t) => (
            <button key={t} className="topic-chip" onClick={() => sendMessage(`Explain ${t} in India`)}>
              {t}
            </button>
          ))}
        </div>

        <div className="sidebar-footer">
          Powered by GPT · Indian Law
          <br />
          Not a substitute for professional legal advice.
        </div>
      </aside>

      {/* ── Chat Area ── */}
      <main className="chat-area">
        {/* Header */}
        <header className="chat-header">
          <div className="chat-header-left">
            <span className="chat-header-title serif">Legal Information Assistant</span>
            <span className="chat-header-badge">Indian Law</span>
            {pdfMeta && (
              <span className="chat-header-badge" style={{ color: "#6a9b6a", borderColor: "rgba(106,155,106,0.4)" }}>
                PDF Active
              </span>
            )}
          </div>
          <span className="chat-header-right">
            Consult a lawyer for binding advice
          </span>
        </header>

        {/* Messages */}
        <div className="messages-container">
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-emblem">⚖️</div>
              <h1 className="welcome-title">How can I assist you?</h1>
              <p className="welcome-subtitle">
                Ask me anything about Indian law — criminal, civil, family, property, consumer rights, and more. I explain legal concepts in plain language.
              </p>
              <div className="welcome-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    className="suggestion-card"
                    onClick={() => sendMessage(s.text)}
                  >
                    <div className="suggestion-card-icon">{s.icon}</div>
                    <div className="suggestion-card-text">{s.text}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div key={i} className={`message-row ${msg.role === "user" ? "user" : "ai"}`}>
                <div className={`message-avatar ${msg.role === "user" ? "user-avatar" : "ai-avatar"}`}>
                  {msg.role === "user" ? "U" : "⚖"}
                </div>
                <div className="message-body">
                  <div className="message-name">
                    {msg.role === "user" ? "You" : "VakilAI"}
                  </div>
                  <div className={`message-bubble ${msg.role === "user" ? "user" : "ai"}`}>
                    {msg.role === "assistant" ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    ) : (
                      msg.content
                    )}
                  </div>
                  <div className="message-time">{formatTime(msg.timestamp)}</div>
                </div>
              </div>
            ))
          )}

          {/* Typing indicator */}
          {isLoading && (
            <div className="typing-indicator">
              <div className="message-avatar ai-avatar">⚖</div>
              <div>
                <div className="message-name">VakilAI</div>
                <div className="typing-dots">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="error-toast">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="input-area">
          <div className="input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Ask a legal question… (Shift+Enter for new line)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
              maxLength={MAX_CHARS + 50}
            />
            <button
              className="send-btn"
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading || charError}
              title="Send (Enter)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>

          <div className="input-footer">
            <span className="input-hint">Enter to send · Shift+Enter for new line</span>
            <span className={`char-count ${charError ? "error" : charWarn ? "warn" : ""}`}>
              {charCount}/{MAX_CHARS}
            </span>
          </div>

          <div className="disclaimer">
            VakilAI provides legal information, not legal advice. Always consult a qualified advocate for your specific situation.
          </div>
        </div>
      </main>
    </div>
  );
}