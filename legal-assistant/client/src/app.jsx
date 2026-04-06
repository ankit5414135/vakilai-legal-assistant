import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const API_BASE = import.meta.env.VITE_API_URL || "";
const MAX_CHARS = 2000;

function genSession() { return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`; }
function fmtTime(d) { return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }); }

// ── Static data (always renders, never fails) ──────────────────────────────
const NEWS = [
  { tag: "SUPREME COURT", col: "#b91c1c", text: "SC expands anticipatory bail scope — pre-arrest protection now available even without FIR registration", src: "LiveLaw", ago: "2h ago" },
  { tag: "HIGH COURT",    col: "#1d4ed8", text: "Delhi HC: Police must register FIR within 24 hours of complaint; unjustified delay amounts to contempt", src: "Bar & Bench", ago: "4h ago" },
  { tag: "RTI",           col: "#92400e", text: "CIC rules: Departments ignoring RTI beyond 30 days face automatic penalty. No extension permitted.", src: "The Hindu", ago: "Yesterday" },
  { tag: "CONSUMER",      col: "#166534", text: "NCDRC: E-commerce platforms equally liable as sellers for defective products — cannot escape by blaming vendor", src: "Moneycontrol", ago: "2d ago" },
  { tag: "PROPERTY",      col: "#5b21b6", text: "SC reaffirms daughters' right to ancestral property — share vests from birth, not dependent on father's will", src: "India Today", ago: "3d ago" },
  { tag: "LABOUR",        col: "#7c2d12", text: "Labour Ministry: Contract workers entitled to same ESI and PF benefits as permanent employees from 2025", src: "ET", ago: "4d ago" },
];

const FEES = [
  { court: "District Court",  type: "Civil Suit (up to ₹1L)",    fee: "₹200" },
  { court: "District Court",  type: "Criminal Complaint",         fee: "₹50"  },
  { court: "High Court",      type: "Writ Petition (HC)",         fee: "₹500" },
  { court: "High Court",      type: "Civil Appeal",               fee: "₹1,000" },
  { court: "Consumer Forum",  type: "Claim up to ₹5 Lakh",       fee: "₹200" },
  { court: "Consumer Forum",  type: "Claim ₹5L – ₹20L",          fee: "₹400" },
  { court: "Supreme Court",   type: "SLP / Civil Appeal",         fee: "₹5,000" },
  { court: "RTI Authority",   type: "RTI Application",            fee: "₹10"  },
];

const GUIDES = {
  Criminal: [
    { icon: "📋", name: "Lodge an FIR",        note: "At police station for cognizable offences",  tag: "Sec 154 CrPC"  },
    { icon: "🔓", name: "Apply for Bail",       note: "Before Session Court or Magistrate",         tag: "Sec 437/439"   },
    { icon: "🛡", name: "Anticipatory Bail",    note: "Pre-arrest protection before Sessions/HC",   tag: "Sec 438 CrPC"  },
    { icon: "⚖",  name: "Quash FIR via HC",    note: "High Court writ under Article 226",          tag: "Sec 482 CrPC"  },
    { icon: "📝", name: "File a Complaint",     note: "Non-cognizable offence via Magistrate",      tag: "Sec 200 CrPC"  },
  ],
  Civil: [
    { icon: "🏛", name: "File a Civil Suit",    note: "Plaint filed before District Court",         tag: "CPC Order VII" },
    { icon: "🚫", name: "Get an Injunction",    note: "Temporary or permanent restraining order",   tag: "Order XXXIX"   },
    { icon: "📤", name: "Appeal a Decree",      note: "First appeal to District Court or HC",       tag: "Sec 96 CPC"    },
    { icon: "📜", name: "Execution Petition",   note: "Enforce an existing court decree",           tag: "Order XXI CPC" },
  ],
  Family: [
    { icon: "💔", name: "File for Divorce",     note: "Mutual or contested under Hindu Marriage Act", tag: "Sec 13 HMA"  },
    { icon: "👶", name: "Child Custody",         note: "Guardianship petition before Family Court",   tag: "GWA 1890"    },
    { icon: "💰", name: "Claim Maintenance",    note: "Interim maintenance pending final order",       tag: "Sec 125 CrPC"},
    { icon: "🆘", name: "Domestic Violence",    note: "Protection order under PWDV Act 2005",          tag: "Sec 12 PWDVA"},
  ],
  Consumer: [
    { icon: "🏪", name: "District Forum",       note: "For claims up to ₹50 Lakh",                 tag: "Consumer Act 2019" },
    { icon: "🏢", name: "State Commission",     note: "For claims ₹50L to ₹2 Crore",               tag: "Section 47"        },
    { icon: "🏛", name: "National Commission",  note: "For claims above ₹2 Crore",                  tag: "Section 58"        },
    { icon: "🛒", name: "E-Commerce Complaint", note: "Platform & seller jointly liable",            tag: "Section 94"        },
  ],
};

const QUICK_QS = [
  "What are my rights if police arrest me?",
  "How do I file an RTI application?",
  "Steps to file a consumer complaint in India",
  "What is the divorce process under Hindu Marriage Act?",
  "Explain tenant rights under the Rent Control Act",
  "How to register property in India?",
];

const QUOTES = [
  { q: "Justice delayed is justice denied.",                     a: "W.E. Gladstone"     },
  { q: "The law is reason, free from passion.",                  a: "Aristotle"          },
  { q: "Injustice anywhere is a threat to justice everywhere.",  a: "Martin Luther King Jr." },
  { q: "Equal justice under law.",                               a: "U.S. Supreme Court" },
];

// Weather code → icon + label
function parseWeather(code) {
  if (code >= 95) return ["⛈", "Thunderstorm"];
  if (code >= 80) return ["🌦", "Showers"];
  if (code >= 61) return ["🌧", "Rainy"];
  if (code >= 51) return ["🌦", "Drizzle"];
  if (code >= 45) return ["🌫", "Foggy"];
  if (code >= 3)  return ["⛅", "Cloudy"];
  if (code >= 1)  return ["🌤", "Partly Cloudy"];
  return ["☀", "Clear Sky"];
}

export default function App() {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [sessionId]               = useState(genSession);
  const [chatOpen,  setChatOpen]  = useState(false);
  const [activeTab, setActiveTab] = useState("Criminal");
  const [pdfMeta,   setPdfMeta]   = useState(null);
  const [pdfLoading,setPdfLoading]= useState(false);
  const [now,       setNow]       = useState(new Date());
  const [unread,    setUnread]    = useState(0);
  const [quoteIdx]                = useState(() => Math.floor(Math.random() * QUOTES.length));

  // Weather state — always has a visible default so widget never looks broken
  const [weather, setWeather] = useState({
    temp: "—", desc: "Loading…", icon: "🌡",
    city: "Detecting…", humidity: "—", wind: "—", fetched: false,
  });

  const endRef  = useRef(null);
  const taRef   = useRef(null);
  const fileRef = useRef(null);

  // ── Clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Weather + Location ─────────────────────────────────────────────────
  useEffect(() => {
    async function fetchWeather(lat, lon) {
      try {
        // Open-Meteo: free, no key, HTTPS ✓
        const wRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh`
        );
        if (!wRes.ok) throw new Error("weather fetch failed");
        const wData = await wRes.json();

        const curr  = wData.current;
        const temp  = Math.round(curr.temperature_2m ?? 0);
        const hum   = Math.round(curr.relative_humidity_2m ?? 0);
        const wind  = Math.round(curr.wind_speed_10m ?? 0);
        const code  = curr.weather_code ?? 0;
        const [icon, desc] = parseWeather(code);

        // Nominatim reverse geocode — free, HTTPS ✓
        let city = "Your Location";
        try {
          const gRes = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&zoom=10`,
            { headers: { "Accept-Language": "en" } }
          );
          if (gRes.ok) {
            const gData = await gRes.json();
            city = gData.address?.city
                || gData.address?.town
                || gData.address?.village
                || gData.address?.county
                || gData.address?.state
                || "Your Location";
          }
        } catch {}

        setWeather({ temp: `${temp}`, desc, icon, city, humidity: `${hum}%`, wind: `${wind} km/h`, fetched: true });
      } catch {
        setWeather(w => ({ ...w, temp: "N/A", desc: "Unavailable", icon: "🌡", fetched: true }));
      }
    }

    if (!navigator.geolocation) {
      setWeather(w => ({ ...w, city: "India", desc: "Location N/A", icon: "🌡", fetched: true }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => fetchWeather(coords.latitude, coords.longitude),
      () => setWeather(w => ({ ...w, city: "India", desc: "Allow location for weather", icon: "🌡", fetched: true })),
      { timeout: 8000 }
    );
  }, []);

  // ── Auto scroll ────────────────────────────────────────────────────────
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  // ── Textarea auto-resize ───────────────────────────────────────────────
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  // ── Send message ───────────────────────────────────────────────────────
  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setError(null);
    setInput("");
    setMessages(p => [...p, { role: "user", content: msg, ts: new Date() }]);
    setLoading(true);
    setChatOpen(true);

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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Server error ${res.status}`);
      setMessages(p => [...p, { role: "assistant", content: data.reply, ts: new Date() }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, sessionId]);

  const handleKey = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };

  // ── PDF upload ─────────────────────────────────────────────────────────
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
        content: `**Document uploaded:** *${file.name}* (${data.pages} pages). Ask me anything about it.`,
        ts: new Date(),
      }]);
      setChatOpen(true);
    } catch (e) {
      alert("PDF upload failed: " + e.message);
    } finally {
      setPdfLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────
  const mo      = now.getMonth();
  const session = mo >= 5 && mo <= 9 ? "Monsoon Recess" : mo >= 10 || mo <= 1 ? "Winter Session" : "Summer Session";
  const quote   = QUOTES[quoteIdx];
  const dayNum  = String(now.getDate()).padStart(2, "0");

  // ── Handlers for quick-ask inputs ─────────────────────────────────────
  const handleQuickInputKey = e => {
    if (e.key === "Enter" && e.target.value.trim()) {
      send(e.target.value.trim());
      e.target.value = "";
    }
  };

  const handleQuickSend = e => {
    const inp = e.currentTarget.previousSibling;
    if (inp && inp.value.trim()) {
      send(inp.value.trim());
      inp.value = "";
    }
  };

  return (
    <div className="root">

      {/* ════ TOPBAR ═══════════════════════════════════════════════ */}
      <header className="topbar">
        <div className="tb-brand">
          <div className="tb-crest">⚖</div>
          <div>
            <div className="tb-name">VakilAI</div>
            <div className="tb-sub">Kanoon ka Sachcha Saathi</div>
          </div>
        </div>

        <nav className="tb-nav">
          {["Dashboard", "Legal News", "Court Fees", "Case Guides"].map(l => (
            <span key={l} className="tb-link">{l}</span>
          ))}
        </nav>

        <div className="tb-meta">
          <div className="tb-clock">
            {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
          </div>
          <div className="tb-loc">
            <span className="loc-dot" />
            {weather.city}
          </div>
        </div>
      </header>

      {/* ════ MASTHEAD ═════════════════════════════════════════════ */}
      <section className="masthead">
        <div className="mast-l">
          <div className="mast-eyebrow">
            <span className="eline" /> India's AI Legal Platform <span className="eline" />
          </div>
          <h1 className="mast-h1">
            Samjho Kanoon,<br />
            <em className="mast-em">Jaano Apna Haq.</em>
          </h1>
          <p className="mast-p">
            Legal guidance · Court fees · Case filing help · AI answers — navigate Indian law with confidence.
          </p>

          <div className="mast-stats">
            <div className="mstat">
              <span className="mstat-icon">{weather.icon}</span>
              <div>
                <span className="mstat-val">{weather.temp}{weather.fetched && weather.temp !== "—" && weather.temp !== "N/A" ? "°C" : ""}</span>
                <span className="mstat-lbl">TEMPERATURE</span>
              </div>
            </div>
            <div className="mstat-sep" />
            <div className="mstat">
              <span className="mstat-icon">📅</span>
              <div>
                <span className="mstat-val">{now.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                <span className="mstat-lbl">TODAY</span>
              </div>
            </div>
            <div className="mstat-sep" />
            <div className="mstat">
              <span className="mstat-icon">🏛</span>
              <div>
                <span className="mstat-val">{session.split(" ")[0]}</span>
                <span className="mstat-lbl">COURT SESSION</span>
              </div>
            </div>
          </div>

          <button className="mast-btn" onClick={() => setChatOpen(true)}>
            Ask VakilAI a Legal Question →
          </button>
        </div>

        <div className="mast-r">
          <div className="quote-card">
            <div className="qc-mark">"</div>
            <p className="qc-text">{quote.q}</p>
            <p className="qc-author">— {quote.a}</p>
          </div>
          <div className="stat-grid">
            {[["50Cr+","Indians Protected"],["25+","Laws Covered"],["24/7","AI Available"],["Free","No Cost"]].map(([n,l]) => (
              <div key={l} className="sgrid-item">
                <span className="sg-n">{n}</span>
                <span className="sg-l">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ════ DASHBOARD GRID ═══════════════════════════════════════ */}
      <main className="dash">

        {/* ── LEFT COLUMN ── */}
        <div className="col col-l">

          {/* Weather */}
          <div className="card card-weather">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">LIVE WEATHER</span>
              <span className="hdr-right live-badge">● LIVE</span>
            </div>
            <div className="wth-hero">
              <span className="wth-temp">{weather.temp}{weather.fetched && weather.temp !== "—" && weather.temp !== "N/A" ? "°" : ""}</span>
              <div className="wth-info">
                <span className="wth-big-icon">{weather.icon}</span>
                <span className="wth-cond">{weather.desc}</span>
                <span className="wth-city">📍 {weather.city}</span>
              </div>
            </div>
            <div className="wth-row">
              <div className="wth-chip">💧<span>Humidity</span><strong>{weather.humidity || "—"}</strong></div>
              <div className="wth-chip">💨<span>Wind</span><strong>{weather.wind || "—"}</strong></div>
              <div className="wth-chip">🌡<span>Feels Like</span><strong>{weather.temp !== "—" ? `${weather.temp}°` : "—"}</strong></div>
            </div>
          </div>

          {/* Date & Session */}
          <div className="card card-date">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">DATE &amp; SESSION</span>
            </div>
            <div className="dt-hero">
              <div className="dt-big">{dayNum}</div>
              <div className="dt-side">
                <div className="dt-month">{now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
                <div className="dt-day">{now.toLocaleDateString("en-IN", { weekday: "long" })}</div>
              </div>
            </div>
            <div className="dt-session">{session}</div>
            <div className="dt-clock">
              {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
            </div>
          </div>

          {/* Court Fees */}
          <div className="card card-fees">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">COURT FEES</span>
              <span className="hdr-right live-badge">● UPDATED</span>
            </div>
            <table className="fees-table">
              <thead>
                <tr>
                  <th>Court</th>
                  <th>Case Type</th>
                  <th className="fee-col">Fee</th>
                </tr>
              </thead>
              <tbody>
                {FEES.map((f, i) => (
                  <tr key={i}>
                    <td className="ft-court">{f.court}</td>
                    <td className="ft-type">{f.type}</td>
                    <td className="ft-fee">{f.fee}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── MIDDLE COLUMN ── */}
        <div className="col col-m">

          {/* Case Guides */}
          <div className="card card-guides">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">CASE FILING GUIDE</span>
            </div>
            <div className="guide-tabs">
              {Object.keys(GUIDES).map(tab => (
                <button
                  key={tab}
                  className={`gtab${activeTab === tab ? " active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="guide-list">
              {GUIDES[activeTab].map((g, i) => (
                <button
                  key={i}
                  className="grow"
                  onClick={() => send(`Explain how to "${g.name}" in India. Relevant law: ${g.tag}`)}
                >
                  <span className="grow-icon">{g.icon}</span>
                  <div className="grow-body">
                    <span className="grow-name">{g.name}</span>
                    <span className="grow-note">{g.note}</span>
                  </div>
                  <span className="grow-tag">{g.tag}</span>
                  <span className="grow-arrow">→</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Ask */}
          <div className="card card-quick">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">QUICK LEGAL QUERIES</span>
            </div>
            <div className="quick-list">
              {QUICK_QS.map((q, i) => (
                <button key={i} className="qrow" onClick={() => send(q)}>
                  <span className="qrow-num">0{i + 1}</span>
                  <span className="qrow-text">{q}</span>
                  <span className="qrow-arrow">→</span>
                </button>
              ))}
            </div>
            <div className="quick-inputrow">
              <input
                className="q-input"
                placeholder="Type any legal question and press Enter…"
                onKeyDown={handleQuickInputKey}
              />
              <button className="q-btn" onClick={handleQuickSend}>Ask →</button>
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div className="col col-r">
          <div className="card card-news">
            <div className="card-hdr">
              <span className="hdr-dot" /><span className="hdr-lbl">LEGAL NEWS — INDIA</span>
            </div>
            {NEWS.map((n, i) => (
              <div key={i} className="news-item">
                <div className="ni-num">0{i + 1}</div>
                <div className="ni-body">
                  <span
                    className="ni-tag"
                    style={{ color: n.col, background: n.col + "14", borderColor: n.col + "40" }}
                  >
                    {n.tag}
                  </span>
                  <p className="ni-text">{n.text}</p>
                  <div className="ni-meta">
                    <span>📰 {n.src}</span>
                    <span>🕐 {n.ago}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </main>

      {/* ════ FAB ══════════════════════════════════════════════════ */}
      <button className="fab" onClick={() => { setChatOpen(v => !v); setUnread(0); }}>
        <span className="fab-ico">⚖</span>
        <span className="fab-lbl">Ask VakilAI</span>
        {unread > 0 && <span className="fab-badge">{unread}</span>}
      </button>

      {/* ════ CHAT PANEL ═══════════════════════════════════════════ */}
      {chatOpen && <div className="scrim" onClick={() => setChatOpen(false)} />}

      <aside className={`cpanel${chatOpen ? " open" : ""}`}>

        {/* Header */}
        <div className="cp-hd">
          <div className="cp-brand">
            <div className="cp-av">⚖</div>
            <div>
              <div className="cp-name">VakilAI</div>
              <div className="cp-status"><span className="online-dot" />Indian Legal Assistant · Online</div>
            </div>
          </div>
          <div className="cp-acts">
            {pdfMeta  && <span className="cp-pdf">📄 PDF Active</span>}
            <label className="cp-upload" title="Upload PDF legal document">
              📎
              <input
                ref={fileRef} type="file" accept=".pdf"
                style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadPdf(f); }}
              />
            </label>
            <button className="cp-close" onClick={() => setChatOpen(false)}>✕</button>
          </div>
        </div>

        {/* Messages */}
        <div className="cp-msgs">
          {messages.length === 0 && (
            <div className="cp-empty">
              <div className="cpe-ico">⚖</div>
              <p className="cpe-title">Kanoon Poochho, Haq Jaano</p>
              <p className="cpe-sub">Ask me anything about Indian law in plain language.</p>
              {pdfLoading && (
                <div className="cpe-loading">
                  <div className="pdf-spin" /> Parsing your document…
                </div>
              )}
              <div className="cpe-chips">
                {QUICK_QS.slice(0, 4).map((q, i) => (
                  <button key={i} className="cpe-chip" onClick={() => send(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msg-row ${m.role}`}>
              {m.role === "assistant" && <div className="msg-av ai">⚖</div>}
              <div className="msg-wrap">
                <div className={`msg-bub ${m.role}`}>
                  {m.role === "assistant"
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                    : m.content}
                </div>
                <div className="msg-ts">{fmtTime(m.ts)}</div>
              </div>
              {m.role === "user" && <div className="msg-av user">U</div>}
            </div>
          ))}

          {loading && (
            <div className="msg-row assistant">
              <div className="msg-av ai">⚖</div>
              <div className="msg-wrap">
                <div className="msg-bub assistant typing">
                  <span className="dot" /><span className="dot" /><span className="dot" />
                </div>
              </div>
            </div>
          )}

          {error && <div className="msg-err">⚠ {error}</div>}
          <div ref={endRef} />
        </div>

        {/* Input */}
        <div className="cp-inp">
          <div className="inp-label">⚖ Ask anything about Indian Law</div>
          <div className="inp-box">
            <textarea
              ref={taRef}
              className="inp-ta"
              placeholder="Type your legal question… (Shift+Enter for new line)"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
              rows={1}
            />
            <button
              className="inp-send"
              onClick={() => send()}
              disabled={!input.trim() || loading}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
          <div className="inp-foot">
            <span>Enter to send · Shift+Enter for new line</span>
            <span className={input.length > MAX_CHARS * 0.9 ? "inp-warn" : ""}>{MAX_CHARS - input.length}</span>
          </div>
        </div>
      </aside>

    </div>
  );
}
