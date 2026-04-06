import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_CHARS = 2000;
const genId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const fmtTime = d => d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });

// ─── Static content ───────────────────────────────────────────────────────────
const NEWS = [
  { tag: "Supreme Court", text: "SC expands anticipatory bail — pre-arrest protection available even before FIR is filed, rules 5-judge bench", src: "LiveLaw", ago: "2h ago" },
  { tag: "High Court",    text: "Delhi HC: Police must register FIR within 24 hours of receiving complaint or face contempt proceedings", src: "Bar & Bench", ago: "5h ago" },
  { tag: "RTI",           text: "CIC imposes penalty on department ignoring RTI beyond 30 days — no extension permissible under the Act", src: "The Hindu", ago: "Yesterday" },
  { tag: "Consumer",      text: "NCDRC: E-commerce platform jointly liable with seller for defective product — consumer can sue either party", src: "Moneycontrol", ago: "2d ago" },
  { tag: "Property",      text: "SC reaffirms daughters' right to ancestral property — share vests at birth, father's death irrelevant", src: "India Today", ago: "3d ago" },
  { tag: "Labour",        text: "Labour Ministry: Contract workers now entitled to same ESI & PF benefits as permanent employees from Jan 2025", src: "Economic Times", ago: "4d ago" },
];

const FEES = [
  { court: "District Court",  type: "Civil Suit (up to ₹1L)",  fee: "₹200"   },
  { court: "District Court",  type: "Criminal Complaint",       fee: "₹50"    },
  { court: "High Court",      type: "Writ Petition",            fee: "₹500"   },
  { court: "High Court",      type: "Civil Appeal",             fee: "₹1,000" },
  { court: "Consumer Forum",  type: "Claim up to ₹5L",         fee: "₹200"   },
  { court: "Consumer Forum",  type: "Claim ₹5L – ₹20L",        fee: "₹400"   },
  { court: "Supreme Court",   type: "SLP / Civil Appeal",       fee: "₹5,000" },
  { court: "RTI Authority",   type: "RTI Application",          fee: "₹10"    },
];

const GUIDES = {
  Criminal: [
    { icon: "📋", name: "Lodge an FIR",       note: "Cognizable offence at police station",      tag: "Sec 154 CrPC"  },
    { icon: "🔓", name: "Apply for Bail",      note: "Session Court or Magistrate",               tag: "Sec 437/439"   },
    { icon: "🛡", name: "Anticipatory Bail",   note: "Pre-arrest protection order",               tag: "Sec 438 CrPC"  },
    { icon: "⚖",  name: "Quash FIR in HC",    note: "High Court writ under Article 226",         tag: "Sec 482 CrPC"  },
    { icon: "📝", name: "Magistrate Complaint",note: "Non-cognizable offence path",               tag: "Sec 200 CrPC"  },
  ],
  Civil: [
    { icon: "🏛", name: "File a Civil Suit",   note: "Plaint before District Court",              tag: "CPC Order VII" },
    { icon: "🚫", name: "Get an Injunction",   note: "Temporary or permanent order",              tag: "Order XXXIX"   },
    { icon: "📤", name: "Appeal a Decree",     note: "First appeal to District Court or HC",      tag: "Sec 96 CPC"    },
    { icon: "📜", name: "Execution Petition",  note: "Enforce an existing court decree",          tag: "Order XXI CPC" },
  ],
  Family: [
    { icon: "💔", name: "File for Divorce",    note: "Mutual or contested — Hindu Marriage Act",  tag: "Sec 13 HMA"   },
    { icon: "👶", name: "Child Custody",        note: "Guardianship before Family Court",          tag: "GWA 1890"     },
    { icon: "💰", name: "Claim Maintenance",   note: "Interim maintenance pending final order",   tag: "Sec 125 CrPC" },
    { icon: "🆘", name: "Domestic Violence",   note: "Protection under PWDV Act 2005",            tag: "Sec 12 PWDVA" },
  ],
  Consumer: [
    { icon: "🏪", name: "District Forum",      note: "Claims up to ₹50 Lakh",                    tag: "Consumer Act 2019" },
    { icon: "🏢", name: "State Commission",    note: "Claims ₹50L to ₹2 Crore",                  tag: "Section 47"        },
    { icon: "🏛", name: "National Commission", note: "Claims above ₹2 Crore",                    tag: "Section 58"        },
    { icon: "🛒", name: "E-Commerce Complaint",note: "Platform & seller jointly liable",          tag: "Section 94"        },
  ],
};

const QUICK_QS = [
  "What are my rights if police arrest me?",
  "How do I file an RTI application in India?",
  "Steps to file a consumer complaint",
  "What is the divorce process under Hindu Marriage Act?",
  "Explain tenant rights under Rent Control Act",
  "How to register property in India?",
];

const QUOTES = [
  { q: "Justice delayed is justice denied.",                    a: "W.E. Gladstone"     },
  { q: "The law is reason, free from passion.",                 a: "Aristotle"          },
  { q: "Injustice anywhere is a threat to justice everywhere.", a: "Martin Luther King Jr." },
  { q: "Equal justice under law.",                              a: "U.S. Supreme Court" },
];

export default function App() {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [streaming, setStreaming] = useState(false); // true while tokens are arriving
  const [chatOpen,  setChatOpen]  = useState(false);
  const [activeTab, setActiveTab] = useState("Criminal");
  const [pdfMeta,   setPdfMeta]   = useState(null);
  const [pdfLoading,setPdfLoading]= useState(false);
  const [error,     setError]     = useState(null);
  const [now,       setNow]       = useState(new Date());
  const [sessionId]               = useState(genId);
  const [quoteIdx]                = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [navActive, setNavActive] = useState("Dashboard");

  const endRef  = useRef(null);
  const taRef   = useRef(null);
  const fileRef = useRef(null);

  // Clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Auto-scroll
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streaming]);

  // Textarea resize
  useEffect(() => {
    const ta = taRef.current; if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 130) + "px";
  }, [input]);

  // ── STREAMING send ────────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || streaming) return;
    setError(null);
    setInput("");
    setChatOpen(true);

    // Add user message
    setMessages(p => [...p, { role: "user", content: msg, ts: new Date() }]);
    setStreaming(true);

    // Add empty assistant message that will be filled by streamed tokens
    const assistantIdx = messages.length + 1; // index after user msg
    setMessages(p => [...p, { role: "assistant", content: "", ts: new Date(), streaming: true }]);

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          sessionId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error ${res.status}`);
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          try {
            const evt = JSON.parse(raw);

            if (evt.error) { setError(evt.error); break; }
            if (evt.done)  { break; }
            if (evt.token) {
              fullContent += evt.token;
              const captured = fullContent;
              // Update the last assistant message in real time
              setMessages(p => {
                const copy = [...p];
                const last = copy[copy.length - 1];
                if (last?.role === "assistant") {
                  copy[copy.length - 1] = { ...last, content: captured, streaming: true };
                }
                return copy;
              });
            }
          } catch {}
        }
      }

      // Mark streaming complete
      setMessages(p => {
        const copy = [...p];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") {
          copy[copy.length - 1] = { ...last, streaming: false };
        }
        return copy;
      });

    } catch (e) {
      setError(e.message);
      // Remove empty assistant message on error
      setMessages(p => p.filter((m, i) => !(i === p.length - 1 && m.role === "assistant" && !m.content)));
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, messages, sessionId]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  // PDF upload
  const uploadPdf = async file => {
    if (!file) return;
    setPdfLoading(true);
    const fd = new FormData();
    fd.append("pdf", file);
    fd.append("sessionId", sessionId);
    try {
      const res  = await fetch(`${API_BASE}/upload-pdf`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPdfMeta({ name: file.name, pages: data.pages });
      setMessages(p => [...p, {
        role: "assistant",
        content: `**Document loaded:** *${file.name}* (${data.pages} pages). You can now ask me questions about this document.`,
        ts: new Date(),
      }]);
      setChatOpen(true);
    } catch (e) { alert("PDF upload error: " + e.message); }
    finally { setPdfLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const clearPdf = async () => {
    try { await fetch(`${API_BASE}/clear-pdf/${sessionId}`, { method: "DELETE" }); } catch {}
    setPdfMeta(null);
  };

  const mo      = now.getMonth();
  const session = mo >= 5 && mo <= 9 ? "Monsoon Recess" : mo >= 10 || mo <= 1 ? "Winter Session" : "Summer Session";
  const quote   = QUOTES[quoteIdx];
  const dayNum  = String(now.getDate()).padStart(2, "0");

  const scrollTo = id => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="app">

      {/* ════ NAVBAR ════════════════════════════════════════════════ */}
      <header className="navbar">
        <div className="nb-brand">
          <div className="nb-seal">
            <span className="nb-seal-inner">⚖</span>
          </div>
          <div>
            <div className="nb-name">VakilAI</div>
            <div className="nb-tagline">Kanoon ka Sachcha Saathi</div>
          </div>
        </div>

        <nav className="nb-links">
          {[
            { label: "Dashboard",   id: "sec-hero"   },
            { label: "Legal News",  id: "sec-news"   },
            { label: "Court Fees",  id: "sec-fees"   },
            { label: "Case Guides", id: "sec-guides" },
          ].map(({ label, id }) => (
            <button
              key={label}
              className={`nb-link ${navActive === label ? "nb-active" : ""}`}
              onClick={() => { setNavActive(label); scrollTo(id); }}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="nb-right">
          <div className="nb-clock">
            {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
          </div>
          <div className="nb-date-pill">
            {now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
          </div>
        </div>
      </header>

      {/* ════ HERO ══════════════════════════════════════════════════ */}
      <section id="sec-hero" className="hero">
        {/* Decorative column lines */}
        <div className="hero-cols" aria-hidden>
          {[...Array(6)].map((_, i) => <div key={i} className="hero-col-line" />)}
        </div>

        <div className="hero-content">
          <div className="hero-badge">
            <span className="badge-dot" />
            India's AI-Powered Legal Platform
          </div>

          <h1 className="hero-h1">
            Samjho Kanoon,
            <br />
            <span className="hero-accent">Jaano Apna Haq.</span>
          </h1>

          <p className="hero-sub">
            Instant legal guidance · Court filing help · Case law explained in plain Hindi & English — powered by AI, designed for every Indian citizen.
          </p>

          <div className="hero-actions">
            <button className="btn-primary" onClick={() => setChatOpen(true)}>
              Ask VakilAI Now →
            </button>
            <button className="btn-ghost" onClick={() => scrollTo("sec-guides")}>
              Browse Case Guides
            </button>
          </div>

          <div className="hero-meta-row">
            <div className="hm-item">
              <span className="hm-val">50 Cr+</span>
              <span className="hm-lbl">Indians Protected</span>
            </div>
            <div className="hm-sep" />
            <div className="hm-item">
              <span className="hm-val">25+</span>
              <span className="hm-lbl">Laws Covered</span>
            </div>
            <div className="hm-sep" />
            <div className="hm-item">
              <span className="hm-val">24 / 7</span>
              <span className="hm-lbl">AI Available</span>
            </div>
            <div className="hm-sep" />
            <div className="hm-item">
              <span className="hm-val">Free</span>
              <span className="hm-lbl">No Cost Ever</span>
            </div>
          </div>
        </div>

        <div className="hero-aside">
          <div className="quote-panel">
            <div className="qp-ornament">"</div>
            <p className="qp-text">{quote.q}</p>
            <p className="qp-author">— {quote.a}</p>
          </div>

          <div className="date-session-panel">
            <div className="dsp-date">
              <span className="dsp-num">{dayNum}</span>
              <div className="dsp-right">
                <span className="dsp-month">{now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
                <span className="dsp-day">{now.toLocaleDateString("en-IN", { weekday: "long" })}</span>
              </div>
            </div>
            <div className="dsp-session">
              <span className="dss-dot" />{session}
            </div>
            <div className="dsp-clock">
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
            </div>
          </div>
        </div>
      </section>

      {/* ════ SECTION STRIP ══════════════════════════════════════════ */}
      <div className="strip">
        {["IPC 1860", "CrPC", "Consumer Act 2019", "RTI Act 2005", "Hindu Marriage Act", "Labour Law", "Transfer of Property Act", "PWDV Act"].map(t => (
          <span key={t} className="strip-tag">{t}</span>
        ))}
      </div>

      {/* ════ MAIN DASHBOARD ════════════════════════════════════════ */}
      <main className="dash">

        {/* ── Legal News ── */}
        <section id="sec-news" className="panel panel-news">
          <div className="panel-hdr">
            <div className="phdr-left">
              <span className="phdr-rule" />
              <span className="phdr-title">Legal News — India</span>
            </div>
            <span className="phdr-live">● Live Feed</span>
          </div>

          <div className="news-list">
            {NEWS.map((n, i) => (
              <div key={i} className="news-row">
                <div className="nr-idx">{"0" + (i + 1)}</div>
                <div className="nr-body">
                  <span className="nr-tag">{n.tag}</span>
                  <p className="nr-text">{n.text}</p>
                  <div className="nr-meta">
                    <span className="nr-src">📰 {n.src}</span>
                    <span className="nr-ago">🕐 {n.ago}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Court Fees ── */}
        <section id="sec-fees" className="panel panel-fees">
          <div className="panel-hdr">
            <div className="phdr-left">
              <span className="phdr-rule" />
              <span className="phdr-title">Court Fees</span>
            </div>
            <span className="phdr-badge">Official Rates</span>
          </div>

          <table className="fees-tbl">
            <thead>
              <tr>
                <th>Court</th>
                <th>Filing Type</th>
                <th className="fee-r">Fee</th>
              </tr>
            </thead>
            <tbody>
              {FEES.map((f, i) => (
                <tr key={i}>
                  <td className="fc-court">{f.court}</td>
                  <td className="fc-type">{f.type}</td>
                  <td className="fc-fee">{f.fee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── Case Guides ── */}
        <section id="sec-guides" className="panel panel-guides">
          <div className="panel-hdr">
            <div className="phdr-left">
              <span className="phdr-rule" />
              <span className="phdr-title">Case Filing Guide</span>
            </div>
          </div>

          <div className="guide-tabs">
            {Object.keys(GUIDES).map(tab => (
              <button
                key={tab}
                className={`gtab${activeTab === tab ? " on" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="guide-cards">
            {GUIDES[activeTab].map((g, i) => (
              <button
                key={i}
                className="gcard"
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => send(`Explain in detail how to ${g.name} in India. Applicable law: ${g.tag}`)}
              >
                <div className="gcard-top">
                  <span className="gcard-icon">{g.icon}</span>
                  <span className="gcard-tag">{g.tag}</span>
                </div>
                <div className="gcard-name">{g.name}</div>
                <div className="gcard-note">{g.note}</div>
                <div className="gcard-cta">Ask VakilAI →</div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Quick Ask ── */}
        <section className="panel panel-quick">
          <div className="panel-hdr">
            <div className="phdr-left">
              <span className="phdr-rule" />
              <span className="phdr-title">Common Legal Questions</span>
            </div>
          </div>

          <div className="quick-grid">
            {QUICK_QS.map((q, i) => (
              <button key={i} className="qcard" onClick={() => send(q)}>
                <span className="qcard-num">0{i + 1}</span>
                <span className="qcard-text">{q}</span>
                <span className="qcard-arr">→</span>
              </button>
            ))}
          </div>

          <div className="ask-bar">
            <div className="askbar-label">⚖ Ask VakilAI anything about Indian Law</div>
            <div className="askbar-row">
              <input
                className="askbar-inp"
                placeholder="Type your legal question and press Enter…"
                onKeyDown={e => {
                  if (e.key === "Enter" && e.target.value.trim()) {
                    send(e.target.value.trim());
                    e.target.value = "";
                  }
                }}
              />
              <button
                className="askbar-btn"
                onClick={e => {
                  const inp = e.currentTarget.previousSibling;
                  if (inp?.value?.trim()) { send(inp.value.trim()); inp.value = ""; }
                }}
              >
                Ask Now →
              </button>
            </div>
          </div>
        </section>

      </main>

      {/* ════ FAB ════════════════════════════════════════════════════ */}
      <button className="fab" onClick={() => setChatOpen(v => !v)}>
        <div className="fab-inner">
          <span className="fab-icon">⚖</span>
          <span className="fab-text">Ask VakilAI</span>
        </div>
      </button>

      {/* ════ CHAT DRAWER ════════════════════════════════════════════ */}
      {chatOpen && <div className="scrim" onClick={() => setChatOpen(false)} />}

      <aside className={`drawer${chatOpen ? " open" : ""}`}>

        {/* Drawer header */}
        <div className="dw-hd">
          <div className="dw-brand">
            <div className="dw-av">⚖</div>
            <div>
              <div className="dw-name">VakilAI Legal Assistant</div>
              <div className="dw-status">
                <span className="dw-online" />
                Online · Indian Law Expert
              </div>
            </div>
          </div>
          <div className="dw-acts">
            {pdfMeta && (
              <button className="dw-pdf-chip" onClick={clearPdf} title="Remove PDF">
                📄 {pdfMeta.name.slice(0, 12)}… ✕
              </button>
            )}
            <label className="dw-upload" title="Upload legal PDF document">
              📎
              <input
                ref={fileRef} type="file" accept=".pdf"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); }}
              />
            </label>
            <button className="dw-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="dw-msgs">
          {messages.length === 0 && (
            <div className="dw-empty">
              <div className="dwe-seal">⚖</div>
              <h3 className="dwe-title">Kanoon Poochho, Haq Jaano</h3>
              <p className="dwe-sub">Ask me anything about Indian law — plain language, no legal jargon.</p>

              {pdfLoading && (
                <div className="dwe-loading">
                  <div className="pdf-spin" /> Parsing document…
                </div>
              )}

              <div className="dwe-chips">
                {QUICK_QS.slice(0, 4).map((q, i) => (
                  <button key={i} className="dwe-chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" && <div className="msg-av ai">⚖</div>}
              <div className="msg-body">
                <div className={`msg-bub ${m.role}${m.streaming ? " streaming" : ""}`}>
                  {m.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "​"}</ReactMarkdown>
                    : m.content}
                  {m.streaming && <span className="cursor-blink" />}
                </div>
                <div className="msg-time">{fmtTime(m.ts)}</div>
              </div>
              {m.role === "user" && <div className="msg-av user">U</div>}
            </div>
          ))}

          {error && <div className="msg-err">⚠ {error}</div>}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="dw-inp">
          <div className="inp-tag">⚖ Ask anything about Indian Law</div>
          <div className="inp-box">
            <textarea
              ref={taRef}
              className="inp-ta"
              placeholder="Type your legal question… (Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={streaming}
              rows={1}
            />
            <button
              className="inp-send"
              onClick={() => send()}
              disabled={!input.trim() || streaming}
            >
              {streaming
                ? <span className="sending-dots"><span /><span /><span /></span>
                : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
                  </svg>
                )
              }
            </button>
          </div>
          <div className="inp-foot">
            <span>Enter to send · Shift+Enter for new line</span>
            <span className={input.length > MAX_CHARS * 0.9 ? "inp-warn" : ""}>
              {MAX_CHARS - input.length}
            </span>
          </div>
        </div>
      </aside>

    </div>
  );
}
