import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_CHARS = 2000;

function generateSessionId() {
  return `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function formatTime(d) {
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const LEGAL_NEWS = [
  { tag: "SUPREME COURT", color: "#b8380b", text: "SC rules that silent voters cannot be forced to disclose identity in ballot disputes — landmark privacy judgment", src: "LiveLaw", time: "2 hours ago" },
  { tag: "HIGH COURT", color: "#1a6b3a", text: "Delhi HC directs police to register FIR within 24 hours of complaint — refusal punishable under contempt", src: "Bar & Bench", time: "5 hours ago" },
  { tag: "RTI", color: "#7a5c18", text: "CIC rules govt departments must respond to RTI queries within 30 days or face penalty — no extension allowed", src: "The Hindu", time: "Yesterday" },
  { tag: "CONSUMER", color: "#185fa5", text: "NCDRC: Online sellers equally liable as manufacturers for defective products sold via e-commerce platforms", src: "Moneycontrol", time: "2 days ago" },
  { tag: "LABOUR", color: "#6b3a1a", text: "Ministry of Labour notifies new rules — contract workers entitled to same ESI & PF benefits as permanent staff", src: "ET", time: "3 days ago" },
  { tag: "PROPERTY", color: "#3a1a6b", text: "SC upholds women's right to ancestral property — birth establishes right, not father's death", src: "India Today", time: "4 days ago" },
];

const COURT_FEES = [
  { court: "District Court", type: "Civil Suit (up to ₹1L)", fee: "₹200" },
  { court: "District Court", type: "Criminal Complaint", fee: "₹50" },
  { court: "High Court", type: "Writ Petition", fee: "₹500" },
  { court: "High Court", type: "Civil Appeal", fee: "₹1,000" },
  { court: "Consumer Forum", type: "Claim up to ₹5L", fee: "₹200" },
  { court: "Consumer Forum", type: "Claim ₹5L–₹20L", fee: "₹400" },
  { court: "Supreme Court", type: "SLP / Appeal", fee: "₹5,000" },
  { court: "RTI Authority", type: "RTI Application", fee: "₹10" },
];

const SEASON_TABS = ["Criminal", "Civil", "Family", "Consumer"];
const CASE_GUIDES = {
  Criminal: [
    { name: "File an FIR", icon: "📋", note: "At police station; mandatory for cognizable offences", tag: "Section 154 CrPC" },
    { name: "Apply for Bail", icon: "🔓", note: "Regular bail under Sec 437/439 CrPC", tag: "Within 24 hrs of arrest" },
    { name: "Anticipatory Bail", icon: "🛡", note: "Pre-arrest bail from Sessions Court or HC", tag: "Section 438 CrPC" },
    { name: "File a Complaint", icon: "📝", note: "Non-cognizable offence — magistrate complaint", tag: "Section 200 CrPC" },
    { name: "Quash FIR via HC", icon: "⚖", note: "High Court writ under Article 226", tag: "Section 482 CrPC" },
  ],
  Civil: [
    { name: "File a Civil Suit", icon: "🏛", note: "Plaint filed before appropriate District Court", tag: "CPC Order VII" },
    { name: "Injunction Order", icon: "🚫", note: "Temporary or permanent restraining order", tag: "Order XXXIX CPC" },
    { name: "Execution Petition", icon: "📜", note: "Enforce a court decree against opposite party", tag: "Order XXI CPC" },
    { name: "Appeal a Decree", icon: "📤", note: "First appeal to District Court or High Court", tag: "Section 96 CPC" },
  ],
  Family: [
    { name: "File for Divorce", icon: "💔", note: "Mutual or contested under Hindu Marriage Act", tag: "Section 13 HMA" },
    { name: "Child Custody", icon: "👶", note: "Guardianship petition before Family Court", tag: "GWA 1890" },
    { name: "Maintenance Claim", icon: "💰", note: "Interim maintenance pending final order", tag: "Section 125 CrPC" },
    { name: "Domestic Violence", icon: "🆘", note: "Protection order under PWDV Act 2005", tag: "Section 12 PWDVA" },
  ],
  Consumer: [
    { name: "District Forum Complaint", icon: "🏪", note: "Claims up to ₹50 lakhs", tag: "Consumer Act 2019" },
    { name: "State Commission", icon: "🏢", note: "Claims ₹50L to ₹2 crore", tag: "Section 47" },
    { name: "National Commission", icon: "🏛", note: "Claims above ₹2 crore", tag: "Section 58" },
    { name: "E-Commerce Complaint", icon: "🛒", note: "Seller & platform jointly liable", tag: "Sec 94 Consumer Act" },
  ],
};

const QUICK_QUESTIONS = [
  "What are my rights if arrested?",
  "How to file RTI application?",
  "Steps to file consumer complaint",
  "Divorce process in India",
  "Tenant rights under Rent Act",
  "Property registration process",
];

export default function App() {
  const [page, setPage] = useState("dashboard"); // dashboard | chat
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [sessionId] = useState(generateSessionId);
  const [pdfMeta, setPdfMeta] = useState(null);
  const [isPdfUploading, setIsPdfUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("Criminal");
  const [chatOpen, setChatOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [weather, setWeather] = useState({ temp: "--", desc: "Loading…", icon: "🌡", city: "India" });
  const [unread, setUnread] = useState(0);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

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
        const map = [
          [95, "⛈", "Storm"], [61, "🌧", "Rain"], [51, "🌦", "Drizzle"],
          [45, "🌫", "Foggy"], [3, "⛅", "Cloudy"], [0, "☀", "Clear Sky"],
        ];
        const [, icon, desc] = map.find(([code]) => wc >= code) || [0, "☀", "Clear Sky"];
        // Reverse geocode for city name
        let city = "Your Location";
        try {
          const gr = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`);
          const gd = await gr.json();
          city = gd.address?.city || gd.address?.town || gd.address?.state || city;
        } catch {}
        setWeather({ temp, desc, icon, city });
      } catch {
        setWeather({ temp: "--", desc: "Unavailable", icon: "🌡", city: "India" });
      }
    }, () => setWeather({ temp: "--", desc: "Location off", icon: "🌡", city: "India" }));
  }, []);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isLoading]);
  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return;
    ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || isLoading) return;
    setError(null); setInput("");
    const userMsg = { role: "user", content: trimmed, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    if (!chatOpen) { setChatOpen(true); setUnread(0); }
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error");
      setMessages(prev => [...prev, { role: "assistant", content: data.reply, timestamp: new Date() }]);
      if (!chatOpen) setUnread(u => u + 1);
    } catch (err) { setError(err.message); }
    finally { setIsLoading(false); }
  }, [input, isLoading, messages, sessionId, chatOpen]);

  const handleKeyDown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  const handlePdfUpload = async file => {
    if (!file) return; setIsPdfUploading(true);
    const fd = new FormData(); fd.append("pdf", file); fd.append("sessionId", sessionId);
    try {
      const res = await fetch(`${API_BASE}/upload-pdf`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setPdfMeta({ name: file.name, pages: data.pages });
      setMessages(prev => [...prev, { role: "assistant", content: `**Document Loaded:** *${file.name}* (${data.pages} pages). Ask me anything about it.`, timestamp: new Date() }]);
    } catch (err) { alert(err.message); }
    finally { setIsPdfUploading(false); if (fileInputRef.current) fileInputRef.current.value = ""; }
  };

  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });
  const dayStr  = now.toLocaleDateString("en-IN", { weekday: "long" });
  const dayNum  = now.getDate().toString().padStart(2, "0");
  const monthYear = now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  // Determine legal season (simplified by month)
  const mo = now.getMonth();
  const legalSeason = mo >= 5 && mo <= 9 ? "Monsoon Recess" : mo >= 10 || mo <= 1 ? "Winter Session" : "Summer Session";

  return (
    <div className="app">
      {/* ═══ NAVBAR ═══════════════════════════════════════════════════════ */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo-box">⚖</div>
          <div>
            <div className="nav-title">VakilAI</div>
            <div className="nav-sub">Kanoon ka Sachcha Saathi</div>
          </div>
        </div>
        <div className="nav-links">
          {["Dashboard","News","Court Fees","Guides"].map(l => (
            <button key={l} className={`nav-link ${page === l.toLowerCase() ? "active" : ""}`}
              onClick={() => setPage("dashboard")}>{l}</button>
          ))}
        </div>
        <div className="nav-right">
          <div className="nav-time">{timeStr}</div>
          <div className="nav-loc">📍 {weather.city}</div>
        </div>
      </nav>

      {/* ═══ HERO ═════════════════════════════════════════════════════════ */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">IN India's Legal AI Platform</div>
          <h1 className="hero-headline">
            Apna Kanoon,<br/>
            <span className="hero-accent">Apna Haq.</span>
          </h1>
          <p className="hero-desc">
            Legal Guidance · Court Fees · Case Guides · AI Help — everything your legal journey needs, in one place.
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hstat-val">{weather.temp}°C</span>
              <span className="hstat-lbl">TEMPERATURE</span>
            </div>
            <div className="hstat-divider"/>
            <div className="hero-stat">
              <span className="hstat-val">{dayNum} {now.toLocaleDateString("en-IN",{month:"short"})}</span>
              <span className="hstat-lbl">TODAY</span>
            </div>
            <div className="hstat-divider"/>
            <div className="hero-stat">
              <span className="hstat-val">{legalSeason.split(" ")[0]}</span>
              <span className="hstat-lbl">COURT SESSION</span>
            </div>
          </div>
        </div>
        <div className="hero-right">
          <div className="hero-illustration">
            <div className="hero-scales">⚖</div>
            <div className="hero-pillars">
              <div className="pillar"/><div className="pillar"/><div className="pillar"/><div className="pillar"/>
            </div>
            <div className="hero-docs">
              <div className="hero-doc">📜</div>
              <div className="hero-doc" style={{animationDelay:"0.4s"}}>📋</div>
              <div className="hero-doc" style={{animationDelay:"0.8s"}}>⚖</div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ DASHBOARD CARDS ══════════════════════════════════════════════ */}
      <div className="dashboard">

        {/* LIVE WEATHER */}
        <div className="card card-weather">
          <div className="card-header">
            <span className="card-icon">🌤</span>
            <span className="card-label">LIVE WEATHER</span>
            <span className="card-refresh" onClick={() => window.location.reload()}>↻</span>
          </div>
          <div className="weather-big">
            <span className="weather-temp-big">{weather.temp}°</span>
            <span className="weather-cond">
              <span style={{fontSize:28}}>{weather.icon}</span>
              <span className="weather-cond-text">{weather.desc}</span>
              <span className="weather-city">📍 {weather.city}</span>
            </span>
          </div>
          <div className="weather-row">
            <div className="weather-mini"><span>💧</span><span>Humidity</span></div>
            <div className="weather-mini"><span>💨</span><span>Wind</span></div>
            <div className="weather-mini"><span>☁</span><span>Cloud</span></div>
          </div>
        </div>

        {/* DATE & SESSION */}
        <div className="card card-date">
          <div className="card-header">
            <span className="card-icon">📅</span>
            <span className="card-label">DATE & COURT SESSION</span>
          </div>
          <div className="date-display">
            <div className="date-big">{dayNum}</div>
            <div className="date-right">
              <div className="date-month">{monthYear}</div>
              <div className="date-day">{dayStr}</div>
            </div>
          </div>
          <div className="session-pill">{legalSeason}</div>
          <div className="date-time-live">{now.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:true})}</div>
        </div>

        {/* COURT FEES */}
        <div className="card card-fees">
          <div className="card-header">
            <span className="card-icon">💰</span>
            <span className="card-label">TODAY'S COURT FEES</span>
            <span className="live-pill">● LIVE</span>
          </div>
          <div className="fees-table">
            <div className="fees-thead">
              <span>COURT</span><span>TYPE</span><span>FEE</span>
            </div>
            {COURT_FEES.map((f,i) => (
              <div key={i} className="fees-row">
                <span className="fee-court">{f.court}</span>
                <span className="fee-type">{f.type}</span>
                <span className="fee-val">{f.fee}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CASE GUIDES */}
        <div className="card card-guides">
          <div className="card-header">
            <span className="card-icon">📚</span>
            <span className="card-label">CASE FILING GUIDE</span>
          </div>
          <div className="tabs">
            {SEASON_TABS.map(t => (
              <button key={t} className={`tab ${activeTab===t?"active":""}`} onClick={() => setActiveTab(t)}>{t}</button>
            ))}
          </div>
          <div className="guides-list">
            {CASE_GUIDES[activeTab].map((g,i) => (
              <div key={i} className="guide-item" onClick={() => { sendMessage(`Explain how to ${g.name} in India under ${g.tag}`); setChatOpen(true); }}>
                <div className="guide-icon">{g.icon}</div>
                <div className="guide-body">
                  <div className="guide-name">{g.name}</div>
                  <div className="guide-note">{g.note}</div>
                </div>
                <div className="guide-tag">{g.tag}</div>
              </div>
            ))}
          </div>
        </div>

        {/* LEGAL NEWS */}
        <div className="card card-news">
          <div className="card-header">
            <span className="card-icon">📰</span>
            <span className="card-label">LEGAL NEWS — INDIA</span>
            <span className="card-refresh">↻</span>
          </div>
          {LEGAL_NEWS.map((n,i) => (
            <div key={i} className="news-item">
              <div className="news-num">0{i+1}</div>
              <div className="news-body">
                <span className="news-tag" style={{background:`${n.color}18`,color:n.color,border:`1px solid ${n.color}40`}}>{n.tag}</span>
                <div className="news-text">{n.text}</div>
                <div className="news-meta">
                  <span className="news-src">📰 {n.src}</span>
                  <span className="news-time">🕐 {n.time}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* QUICK ASK */}
        <div className="card card-quick">
          <div className="card-header">
            <span className="card-icon">⚡</span>
            <span className="card-label">QUICK LEGAL QUESTIONS</span>
          </div>
          <div className="quick-grid">
            {QUICK_QUESTIONS.map((q,i) => (
              <button key={i} className="quick-btn" onClick={() => { sendMessage(q); setChatOpen(true); }}>
                <span className="quick-arrow">›</span>{q}
              </button>
            ))}
          </div>
          <div className="quick-input-row">
            <input
              className="quick-input"
              placeholder="Type your legal question…"
              onKeyDown={e => { if(e.key==="Enter" && e.target.value.trim()) { sendMessage(e.target.value); setChatOpen(true); e.target.value=""; }}}
            />
            <button className="quick-send" onClick={e => { const inp = e.target.previousSibling; if(inp.value.trim()) { sendMessage(inp.value); setChatOpen(true); inp.value=""; }}}>Ask →</button>
          </div>
        </div>
      </div>

      {/* ═══ FLOATING CHAT BUTTON ═════════════════════════════════════════ */}
      <button className="fab" onClick={() => { setChatOpen(!chatOpen); setUnread(0); }}>
        <span className="fab-icon">⚖</span>
        <span className="fab-text">Ask Vakil</span>
        {unread > 0 && <span className="fab-badge">{unread}</span>}
      </button>

      {/* ═══ CHAT DRAWER ══════════════════════════════════════════════════ */}
      <div className={`chat-drawer ${chatOpen ? "open" : ""}`}>
        <div className="drawer-header">
          <div className="drawer-title">
            <span className="drawer-icon">⚖</span>
            <div>
              <div className="drawer-name">VakilAI</div>
              <div className="drawer-sub">Indian Legal Assistant · Online</div>
            </div>
          </div>
          <div className="drawer-actions">
            {pdfMeta && <span className="drawer-pdf-badge">📄 PDF</span>}
            <label className="drawer-upload" title="Upload PDF">
              📎
              <input ref={fileInputRef} type="file" accept=".pdf" style={{display:"none"}}
                onChange={e => { const f=e.target.files?.[0]; if(f) handlePdfUpload(f); }}/>
            </label>
            <button className="drawer-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
        </div>

        <div className="drawer-messages">
          {messages.length === 0 && (
            <div className="drawer-welcome">
              <div className="dw-seal">⚖</div>
              <div className="dw-title">Kanoon Poochho, Haq Jaano</div>
              <div className="dw-sub">Ask me anything about Indian law</div>
              <div className="dw-chips">
                {QUICK_QUESTIONS.slice(0,4).map((q,i) => (
                  <button key={i} className="dw-chip" onClick={() => sendMessage(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`dmsg ${msg.role}`}>
              {msg.role === "assistant" && <div className="dmsg-av">⚖</div>}
              <div className="dmsg-body">
                <div className={`dmsg-bubble ${msg.role}`}>
                  {msg.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    : msg.content}
                </div>
                <div className="dmsg-time">{formatTime(msg.timestamp)}</div>
              </div>
              {msg.role === "user" && <div className="dmsg-av user-av">U</div>}
            </div>
          ))}

          {isLoading && (
            <div className="dmsg assistant">
              <div className="dmsg-av">⚖</div>
              <div className="dmsg-body">
                <div className="dmsg-bubble assistant typing">
                  <span className="tdot"/><span className="tdot"/><span className="tdot"/>
                </div>
              </div>
            </div>
          )}

          {error && <div className="dmsg-err">⚠ {error}</div>}
          <div ref={messagesEndRef}/>
        </div>

        <div className="drawer-input">
          <div className="dinput-ask-tag">⚖ Ask anything about Indian Law</div>
          <div className="dinput-box">
            <textarea
              ref={textareaRef}
              className="dinput-ta"
              placeholder="Type your legal question…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              rows={1}
            />
            <button className="dinput-send" onClick={() => sendMessage()} disabled={!input.trim()||isLoading}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
          <div className="dinput-foot">
            <span>{MAX_CHARS - input.length} chars left</span>
            <span>Enter to send · Shift+Enter for newline</span>
          </div>
        </div>
      </div>

      {chatOpen && <div className="drawer-backdrop" onClick={() => setChatOpen(false)}/>}
    </div>
  );
}
