const express = require("express");
const cors    = require("cors");
const multer  = require("multer");
const pdfParse= require("pdf-parse");
const dotenv  = require("dotenv");
const crypto  = require("crypto");

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_, file, cb) =>
    file.mimetype === "application/pdf" ? cb(null, true) : cb(new Error("Only PDFs allowed")),
});

// ── In-memory stores (replace with a DB for production) ───────────────────────
const users    = {};   // { email: { name, email, passwordHash, createdAt } }
const sessions = {};   // { token: email }
const chatHistory = {}; // { email: [ { id, title, messages:[], createdAt } ] }
const pdfStore = {};   // { sessionId: text }

// ── Helpers ───────────────────────────────────────────────────────────────────
const hash  = s => crypto.createHash("sha256").update(s).digest("hex");
const token = () => crypto.randomBytes(32).toString("hex");
const uid   = () => crypto.randomBytes(8).toString("hex");

function authMiddleware(req, res, next) {
  const t = req.headers.authorization?.split(" ")[1];
  if (!t || !sessions[t]) return res.status(401).json({ error: "Unauthorized. Please log in." });
  req.userEmail = sessions[t];
  next();
}

// Seed a demo user so the app works out of the box
users["demo@vakilai.com"] = {
  name: "Demo User", email: "demo@vakilai.com",
  passwordHash: hash("demo123"), createdAt: new Date().toISOString(),
};
chatHistory["demo@vakilai.com"] = [];

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (_, res) => res.json({ status: "ok" }));

// ── POST /auth/register ───────────────────────────────────────────────────────
app.post("/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "Name, email and password are required." });
  if (password.length < 6)
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  if (users[email])
    return res.status(409).json({ error: "An account with this email already exists." });

  users[email] = { name: name.trim(), email, passwordHash: hash(password), createdAt: new Date().toISOString() };
  chatHistory[email] = [];

  const t = token();
  sessions[t] = email;
  res.json({ token: t, user: { name: users[email].name, email } });
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
app.post("/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email and password are required." });

  const user = users[email];
  if (!user || user.passwordHash !== hash(password))
    return res.status(401).json({ error: "Invalid email or password." });

  const t = token();
  sessions[t] = email;
  res.json({ token: t, user: { name: user.name, email } });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────
app.post("/auth/logout", authMiddleware, (req, res) => {
  const t = req.headers.authorization?.split(" ")[1];
  delete sessions[t];
  res.json({ message: "Logged out." });
});

// ── GET /history ──────────────────────────────────────────────────────────────
app.get("/history", authMiddleware, (req, res) => {
  const chats = (chatHistory[req.userEmail] || []).map(c => ({
    id: c.id, title: c.title, createdAt: c.createdAt, messageCount: c.messages.length,
  }));
  res.json({ chats: chats.reverse() }); // newest first
});

// ── GET /history/:id ──────────────────────────────────────────────────────────
app.get("/history/:id", authMiddleware, (req, res) => {
  const chat = (chatHistory[req.userEmail] || []).find(c => c.id === req.params.id);
  if (!chat) return res.status(404).json({ error: "Chat not found." });
  res.json({ chat });
});

// ── DELETE /history/:id ───────────────────────────────────────────────────────
app.delete("/history/:id", authMiddleware, (req, res) => {
  chatHistory[req.userEmail] = (chatHistory[req.userEmail] || []).filter(c => c.id !== req.params.id);
  res.json({ message: "Deleted." });
});

// ── POST /chat ────────────────────────────────────────────────────────────────
app.post("/chat", authMiddleware, async (req, res) => {
  const { message, history = [], chatId } = req.body;

  if (!message?.trim()) return res.status(400).json({ error: "Message cannot be empty." });
  if (message.length > 2000) return res.status(400).json({ error: "Message too long." });

  const KEY = process.env.OPENROUTER_API_KEY;
  if (!KEY || KEY.includes("your-")) return res.status(500).json({ error: "API key not configured." });

  const systemPrompt = `You are VakilAI, an expert legal assistant specialised in Indian law.
Answer clearly and concisely in simple language. Use numbered points when listing steps.
Never give harmful or illegal advice. Recommend consulting a qualified advocate for personal legal matters.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-20),
    { role: "user", content: message.trim() },
  ];

  // Try models in order — non-streaming for reliability
  const MODELS = [
    process.env.OPENROUTER_MODEL || "meta-llama/llama-3.1-8b-instruct:free",
    "google/gemma-3-12b-it:free",
    "meta-llama/llama-3.1-8b-instruct:free",
    "microsoft/phi-4:free",
    "openrouter/auto",
  ];

  let reply = null;

  for (const model of MODELS) {
    try {
      console.log(`🤖 Trying ${model}…`);
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${KEY}`,
          "HTTP-Referer":  process.env.CLIENT_URL || "http://localhost:3000",
          "X-Title":       "VakilAI",
        },
        body: JSON.stringify({ model, messages, max_tokens: 1200, temperature: 0.4, stream: false }),
      });

      const data = await r.json();

      if (!r.ok) {
        const msg = data?.error?.message || "";
        console.warn(`  ✗ ${model}: ${msg}`);
        if (msg.includes("No endpoints") || r.status === 404 || r.status === 400) continue;
        // Auth or rate-limit — stop trying
        return res.status(502).json({ error: msg || "API error." });
      }

      reply = data.choices?.[0]?.message?.content?.trim();
      if (reply) { console.log(`  ✓ ${model}`); break; }
    } catch (e) {
      console.warn(`  ✗ ${model}: ${e.message}`);
    }
  }

  if (!reply) return res.status(502).json({ error: "All models unavailable right now. Please try again in a moment." });

  // Save / update chat history
  const email = req.userEmail;
  if (!chatHistory[email]) chatHistory[email] = [];

  let chat = chatHistory[email].find(c => c.id === chatId);
  if (!chat) {
    // New conversation
    const title = message.trim().slice(0, 60) + (message.length > 60 ? "…" : "");
    chat = { id: uid(), title, messages: [], createdAt: new Date().toISOString() };
    chatHistory[email].push(chat);
  }

  // Append both turns
  chat.messages.push(
    { role: "user",      content: message.trim(), ts: new Date().toISOString() },
    { role: "assistant", content: reply,           ts: new Date().toISOString() },
  );

  res.json({ reply, chatId: chat.id });
});

// ── PDF upload ────────────────────────────────────────────────────────────────
app.post("/upload-pdf", authMiddleware, upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file." });
  try {
    const parsed = await pdfParse(req.file.buffer);
    let text = parsed.text?.trim();
    if (!text || text.length < 20) return res.status(400).json({ error: "No readable text in PDF." });
    if (text.length > 12000) text = text.slice(0, 12000) + "\n[Truncated]";
    const sid = req.body.sessionId || uid();
    pdfStore[sid] = text;
    res.json({ sessionId: sid, pages: parsed.numpages });
  } catch { res.status(500).json({ error: "PDF parse failed." }); }
});

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Max 10 MB." });
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`⚖  VakilAI  →  http://localhost:${PORT}`);
  console.log(`📧 Demo login: demo@vakilai.com / demo123`);
});