import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_CHARS = 2000;

function genSession() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function fmtTime(d) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const NEWS = [
  { tag: "SUPREME COURT", col: "#c0392b", text: "SC expands scope of anticipatory bail — arrest without prior notice now challengeable before High Court", src: "LiveLaw", ago: "2h ago" },
  { tag: "HIGH COURT", col: "#1a3a6b", text: "Delhi HC: Police must register FIR within 24 hours; unexplained delay treated as contempt of court", src: "Bar & Bench", ago: "5h ago" },
  { tag: "RTI", col: "#7a5c18", text: "CIC: Govt departments that ignore RTI queries beyond 30 days face automatic penalty — no extension permitted", src: "The Hindu", ago: "Yesterday" },
  { tag: "CONSUMER", col: "#155724", text: "NCDRC holds e-commerce platforms jointly liable with sellers for defective goods delivered to consumers", src: "Moneycontrol", ago: "2d ago" },
  { tag: "PROPERTY", col: "#5a1a8b", text: "SC reaffirms: Daughter's share in ancestral property vests from birth, regardless of father's status", src: "India Today", ago: "3d ago" },
  { tag: "LABOUR", col: "#6b3a1a", text: "New labour code: Contract workers entitled to same ESI & PF benefits as permanent employees from 2025", src: "ET", ago: "4d ago" },
];

const FEES = [
  { court: "District Court", type: "Civil Suit (≤₹1L)", fee: "₹200" },
  { court: "District Court", type: "Criminal Complaint", fee: "₹50" },
  { court: "High Court", type: "Writ Petition", fee: "₹500" },
  { court: "High Court", type: "Civil Appeal", fee: "₹1,000" },
  { court: "Consumer Forum", type: "Claim ≤₹5L", fee: "₹200" },
  { court: "Supreme Court", type: "SLP / Appeal", fee: "₹5,000" },
  { court: "RTI", type: "Application Fee", fee: "₹10" },
];

const GUIDES = {
  Criminal: [
    { icon: "📋", name: "Lodge an FIR", note: "Cognizable offence — police station", tag: "Sec 154 CrPC" },
    { icon: "🔓", name: "Apply for Bail", note: "Session Court or Magistrate", tag: "Sec 437/439" },
    { icon: "🛡", name: "Anticipatory Bail", note: "Pre-arrest protection order", tag: "Sec 438 CrPC" },
    { icon: "⚖", name: "Quash FIR via HC", note: "Writ under Article 226", tag: "Sec 482 CrPC" },
  ],
  Civil: [
    { icon: "🏛", name: "File a Civil Suit", note: "Plaint before District Court", tag: "CPC Order VII" },
    { icon: "🚫", name: "Get Injunction", note: "Temporary restraining order", tag: "Order XXXIX" },
    { icon: "📤", name: "Appeal a Decree", note: "First appeal to HC or DC", tag: "Sec 96 CPC" },
    { icon: "📜", name: "Execution Petition", note: "Enforce existing court decree", tag: "Order XXI CPC" },
  ],
  Family: [
    { icon: "💔", name: "File for Divorce", note: "Mutual or contested petition", tag: "Sec 13 HMA" },
    { icon: "👶", name: "Child Custody", note: "Guardianship before Family Court", tag: "GWA 1890" },
    { icon: "💰", name: "Claim Maintenance", note: "Interim maintenance order", tag: "Sec 125 CrPC" },
    { icon: "🆘", name: "Domestic Violence", note: "Protection under PWDV Act", tag: "Sec 12 PWDVA" },
  ],
  Consumer: [
    { icon: "🏪", name: "District Forum", note: "Claims up to ₹50 lakhs", tag: "Consumer Act 2019" },
    { icon: "🏢", name: "State Commission", note: "₹50L – ₹2 crore claims", tag: "Section 47" },
    { icon: "🏛", name: "National Commission", note: "Claims above ₹2 crore", tag: "Section 58" },
    { icon: "🛒", name: "E-Commerce Complaint", note: "Platform & seller jointly liable", tag: "Sec 94" },
  ],
};

const QUICK_QS = [
  "What are my rights if arrested by police?",
  "How do I file an RTI application?",
  "Steps to file a consumer complaint",
  "What is the divorce process in India?",
  "Explain tenant rights under Rent Act",
  "How to register property in India?",
];

const LEGAL_QUOTES = [
  { q: "Justice delayed is justice denied.", a: "W.E. Gladstone" },
  { q: "The law is reason, free from passion.", a: "Aristotle" },
  { q: "Injustice anywhere is a threat to justice everywhere.", a: "Martin Luther King Jr." },
  { q: "Equal justice under law.", a: "U.S. Supreme Court" },
];

export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId] = useState(genSession);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("Criminal");
  const [pdfMeta, setPdfMeta] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState({ temp: "--", desc: "Detecting…", icon: "🌡", city: "India" });
  const [unread, setUnread] = useState(0);
  const [quoteIdx] = useState(() => Math.floor(Math.random() * LEGAL_QUOTES.length));

  const endRef = useRef(null);
  const taRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(async ({ coords }) => {
      try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude.toFixed(2)}&longitude=${coords.longitude.toFixed(2)}&current_weather=true`);
        const d = await r.json();
        const wc = d.current_weather?.weathercode ?? 0;
        const temp = Math.round(d.current_weather?.temperature ?? 0);
        const map = [[95,"⛈","Stormy"],[61,"🌧","Rainy"],[51,"🌦","Drizzle"],[45,"🌫","Foggy"],[3,"⛅","Cloudy"],[0,"☀","Clear"]];
        const [, icon, desc] = map.find(([c]) => wc >= c) || [0,"☀","Clear"];
        let city = "India";
        try {
          const g = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`);
          const gd = await g.json();
          city = gd.address?.city || gd.address?.town || gd.address?.state || "India";
        } catch {}
        setWeather({ temp, desc, icon, city });
      } catch { setWeather({ temp: "--", desc: "Unavailable", icon: "🌡", city: "India" }); }
    }, () => setWeather({ temp: "--", desc: "Allow location", icon: "🌡", city: "India" }));
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);
  useEffect(() => {
    if (!taRef.current) return;
    taRef.current.style.height = "auto";
    taRef.current.style.height = Math.min(taRef.current.scrollHeight, 120) + "px";
  }, [input]);

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setError(null); setInput("");
    const userMsg = { role: "user", content: msg, ts: new Date() };
    setMessages(p => [...p, userMsg]);
    setLoading(true);
    if (!chatOpen) setChatOpen(true);
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, history, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setMessages(p => [...p, { role: "assistant", content: data.reply, ts: new Date() }]);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [input, loading, messages, sessionId, chatOpen]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  const uploadPdf = async file => {
    if (!file) return;
    setPdfLoading(true);
    const fd = new FormData(); fd.append("pdf", file); fd.append("sessionId", sessionId);
    try {
      const res = await fetch(`${API_BASE}/upload-pdf`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPdfMeta({ name: file.name, pages: data.pages });
      setMessages(p => [...p, { role: "assistant", content: `**Document uploaded:** *${file.name}* (${data.pages} pages). Ask me anything about it.`, ts: new Date() }]);
    } catch (e) { alert("PDF error: " + e.message); }
    finally { setPdfLoading(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const mo = now.getMonth();
  const session = mo >= 5 && mo <= 9 ? "Monsoon Recess" : mo >= 10 || mo <= 1 ? "Winter Session" : "Summer Session";
  const quote = LEGAL_QUOTES[quoteIdx];

  return (
    <div className="root">

      {/* ── TOPBAR ────────────────────────────────────────────────── */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-crest">
            <span className="crest-scale">⚖</span>
          </div>
          <div>
            <div className="tb-name">VakilAI</div>
            <div className="tb-sub">Kanoon ka Sachcha Saathi</div>
          </div>
        </div>

        <nav className="tb-nav">
          {["Dashboard","Legal News","Court Fees","Case Guides"].map(l => (
            <a key={l} className="tb-link" href="#">{l}</a>
          ))}
        </nav>

        <div className="tb-meta">
          <div className="tb-clock">
            {now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true})}
          </div>
          <div className="tb-location">
            <span className="loc-dot"/>
            {weather.city}
          </div>
        </div>
      </header>

      {/* ── MASTHEAD ──────────────────────────────────────────────── */}
      <section className="masthead">
        <div className="mast-left">
          <div className="mast-eyebrow">
            <span className="eyebrow-line"/> India's AI Legal Platform <span className="eyebrow-line"/>
          </div>
          <h1 className="mast-title">
            Samjho Kanoon,<br/>
            <em className="mast-em">Jaano Apna Haq.</em>
          </h1>
          <p className="mast-desc">
            Legal guidance, court fees, case filing help, and AI answers — everything you need to navigate Indian law with confidence.
          </p>

          <div className="mast-pills">
            <div className="mast-pill">
              <span className="pill-icon">{weather.icon}</span>
              <div>
                <span className="pill-val">{weather.temp}°C</span>
                <span className="pill-lbl">TEMPERATURE</span>
              </div>
            </div>
            <div className="pill-sep"/>
            <div className="mast-pill">
              <span className="pill-icon">📅</span>
              <div>
                <span className="pill-val">{now.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</span>
                <span className="pill-lbl">TODAY</span>
              </div>
            </div>
            <div className="pill-sep"/>
            <div className="mast-pill">
              <span className="pill-icon">🏛</span>
              <div>
                <span className="pill-val">{session.split(" ")[0]}</span>
                <span className="pill-lbl">COURT SESSION</span>
              </div>
            </div>
          </div>

          <button className="mast-cta" onClick={() => setChatOpen(true)}>
            Ask VakilAI a Question →
          </button>
        </div>

        <div className="mast-right">
          <div className="mast-quote-card">
            <div className="mqc-mark">"</div>
            <p className="mqc-text">{quote.q}</p>
            <p className="mqc-author">— {quote.a}</p>
          </div>
          <div className="mast-stat-grid">
            <div className="mast-stat"><span className="ms-n">50Cr+</span><span className="ms-l">Indians Protected</span></div>
            <div className="mast-stat"><span className="ms-n">25+</span><span className="ms-l">Laws Covered</span></div>
            <div className="mast-stat"><span className="ms-n">24/7</span><span className="ms-l">AI Available</span></div>
            <div className="mast-stat"><span className="ms-n">Free</span><span className="ms-l">No Cost</span></div>
          </div>
        </div>
      </section>

      {/* ── MAIN GRID ─────────────────────────────────────────────── */}
      <main className="grid-main">

        {/* COL 1: Weather + Date + Fees */}
        <div className="col-left">

          {/* Weather Widget */}
          <div className="widget w-weather">
            <div className="widget-title">
              <span className="wt-dot"/>LIVE WEATHER
            </div>
            <div className="weather-hero">
              <span className="w-temp">{weather.temp}°</span>
              <div className="w-info">
                <span className="w-icon-big">{weather.icon}</span>
                <span className="w-cond">{weather.desc}</span>
                <span className="w-city">📍 {weather.city}</span>
              </div>
            </div>
            <div className="w-strips">
              <div className="wstrip">💧<span>Humidity</span></div>
              <div className="wstrip">💨<span>Wind</span></div>
              <div className="wstrip">🌡<span>Feels like</span></div>
            </div>
          </div>

          {/* Date Widget */}
          <div className="widget w-date">
            <div className="widget-title">
              <span className="wt-dot"/>DATE & SESSION
            </div>
            <div className="date-hero">
              <div className="date-num">{String(now.getDate()).padStart(2,"0")}</div>
              <div className="date-side">
                <div className="date-month">{now.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
                <div className="date-day">{now.toLocaleDateString("en-IN",{weekday:"long"})}</div>
              </div>
            </div>
            <div className="session-chip">{session}</div>
            <div className="date-liveclock">
              {now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true})}
            </div>
          </div>

          {/* Court Fees */}
          <div className="widget w-fees">
            <div className="widget-title">
              <span className="wt-dot"/>COURT FEES
              <span className="live-badge">● LIVE</span>
            </div>
            <table className="fees-tbl">
              <thead>
                <tr><th>Court</th><th>Type</th><th>Fee</th></tr>
              </thead>
              <tbody>
                {FEES.map((f, i) => (
                  <tr key={i}>
                    <td className="td-court">{f.court}</td>
                    <td className="td-type">{f.type}</td>
                    <td className="td-fee">{f.fee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* COL 2: Case Guides + Quick Ask */}
        <div className="col-mid">

          {/* Case Guides */}
          <div className="widget w-guides">
            <div className="widget-title"><span className="wt-dot"/>CASE FILING GUIDE</div>
            <div className="guide-tabs">
              {Object.keys(GUIDES).map(t => (
                <button key={t} className={`gtab ${activeTab===t?"on":""}`} onClick={() => setActiveTab(t)}>{t}</button>
              ))}
            </div>
            <div className="guide-list">
              {GUIDES[activeTab].map((g, i) => (
                <button key={i} className="guide-row" onClick={() => { send(`Explain how to ${g.name} in India under ${g.tag}`); }}>
                  <span className="gr-icon">{g.icon}</span>
                  <div className="gr-body">
                    <span className="gr-name">{g.name}</span>
                    <span className="gr-note">{g.note}</span>
                  </div>
                  <span className="gr-tag">{g.tag}</span>
                  <span className="gr-arrow">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Ask */}
          <div className="widget w-quick">
            <div className="widget-title"><span className="wt-dot"/>QUICK LEGAL QUERIES</div>
            <div className="quick-chips">
              {QUICK_QS.map((q, i) => (
                <button key={i} className="qchip" onClick={() => { send(q); setChatOpen(true); }}>
                  <span className="qchip-num">0{i+1}</span>{q}
                </button>
              ))}
            </div>
            <div className="quick-bar">
              <input
                className="quick-inp"
                placeholder="Type any legal question and press Enter…"
                onKeyDown={e => { if (e.key==="Enter"&&e.target.value.trim()) { send(e.target.value); setChatOpen(true); e.target.value=""; }}}
              />
              <button className="quick-go" onClick={e => { const inp=e.currentTarget.previousSibling; if(inp.value.trim()){send(inp.value);setChatOpen(true);inp.value="";}}} >Ask →</button>
            </div>
          </div>
        </div>

        {/* COL 3: News */}
        <div className="col-right">
          <div className="widget w-news">
            <div className="widget-title"><span className="wt-dot"/>LEGAL NEWS — INDIA</div>
            {NEWS.map((n, i) => (
              <div key={i} className="news-card">
                <div className="nc-left">
                  <div className="nc-num">0{i+1}</div>
                </div>
                <div className="nc-body">
                  <span className="nc-tag" style={{color:n.col,borderColor:`${n.col}50`,background:`${n.col}12`}}>{n.tag}</span>
                  <p className="nc-text">{n.text}</p>
                  <div className="nc-meta">
                    <span>📰 {n.src}</span>
                    <span>🕐 {n.ago}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* ── FAB ──────────────────────────────────────────────────── */}
      <button className="fab" onClick={() => { setChatOpen(!chatOpen); setUnread(0); }}>
        <div className="fab-inner">
          <span className="fab-ico">⚖</span>
          <span className="fab-txt">Ask VakilAI</span>
        </div>
        {unread > 0 && <span className="fab-unread">{unread}</span>}
      </button>

      {/* ── CHAT PANEL ───────────────────────────────────────────── */}
      {chatOpen && <div className="chat-scrim" onClick={() => setChatOpen(false)}/>}

      <aside className={`chat-panel ${chatOpen ? "open" : ""}`}>
        {/* Panel Header */}
        <div className="cp-head">
          <div className="cp-brand">
            <div className="cp-av">⚖</div>
            <div>
              <div className="cp-title">VakilAI</div>
              <div className="cp-status">
                <span className="cps-dot"/>Indian Legal Assistant · Online
              </div>
            </div>
          </div>
          <div className="cp-hactions">
            {pdfMeta && <span className="cp-pdf-tag">📄 PDF</span>}
            <label className="cp-upload-btn" title="Upload legal PDF">
              📎
              <input ref={fileRef} type="file" accept=".pdf" style={{display:"none"}}
                onChange={e => { const f=e.target.files?.[0]; if(f) uploadPdf(f); }}/>
            </label>
            <button className="cp-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="cp-msgs">
          {messages.length === 0 && (
            <div className="cp-empty">
              <div className="cpe-seal">⚖</div>
              <div className="cpe-title">Kanoon Poochho, Haq Jaano</div>
              <div className="cpe-sub">Ask me anything about Indian law — plain language, no jargon.</div>
              {pdfLoading && (
                <div className="cpe-loading"><div className="pdf-spin"/>Parsing document…</div>
              )}
              <div className="cpe-chips">
                {QUICK_QS.slice(0, 4).map((q, i) => (
                  <button key={i} className="cpe-chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`cmsg ${m.role}`}>
              {m.role === "assistant" && <div className="cmsg-av ai">⚖</div>}
              <div className="cmsg-wrap">
                <div className={`cmsg-bubble ${m.role}`}>
                  {m.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    : m.content}
                </div>
                <div className="cmsg-time">{fmtTime(m.ts)}</div>
              </div>
              {m.role === "user" && <div className="cmsg-av user">U</div>}
            </div>
          ))}

          {loading && (
            <div className="cmsg assistant">
              <div className="cmsg-av ai">⚖</div>
              <div className="cmsg-wrap">
                <div className="cmsg-bubble assistant cmsg-typing">
                  <span className="td"/><span className="td"/><span className="td"/>
                </div>
              </div>
            </div>
          )}

          {error && <div className="cmsg-err">⚠ {error}</div>}
          <div ref={endRef}/>
        </div>

        {/* Input */}
        <div className="cp-input">
          <div className="cpi-label">⚖ Ask anything about Indian Law</div>
          <div className="cpi-box">
            <textarea
              ref={taRef}
              className="cpi-ta"
              placeholder="Type your legal question… (Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              rows={1}
            />
            <button className="cpi-send" onClick={() => send()} disabled={!input.trim()||loading}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <div className="cpi-foot">
            <span>Enter to send · Shift+Enter for newline</span>
            <span className={input.length > MAX_CHARS * 0.9 ? "cpi-warn" : ""}>{MAX_CHARS - input.length}</span>
          </div>
        </div>
      </aside>

    </div>
  );
}
