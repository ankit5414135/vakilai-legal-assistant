const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:3000" }));
app.use(express.json({ limit: "2mb" }));

const pdfContextStore = {};

const FALLBACK_MODELS = [
  "google/gemma-3-27b-it:free",
  "meta-llama/llama-3.1-8b-instruct:free",
  "deepseek/deepseek-chat-v3-0324:free",
  "microsoft/phi-4:free",
];

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── POST /chat  (STREAMING — fixes slow response) ─────────────────────────────
// The frontend reads Server-Sent Events; words appear as they are generated.
app.post("/chat", async (req, res) => {
  const { message, history = [], sessionId } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0)
    return res.status(400).json({ error: "Message cannot be empty." });
  if (message.trim().length > 2000)
    return res.status(400).json({ error: "Message too long (max 2000 chars)." });

  const KEY = process.env.OPENROUTER_API_KEY;
  if (!KEY || KEY.includes("your-openrouter"))
    return res.status(500).json({ error: "OPENROUTER_API_KEY not set in .env" });

  let systemPrompt = `You are VakilAI, a knowledgeable legal assistant specialised in Indian law.
Provide accurate, clear, and helpful legal information in simple language.
Never give harmful or illegal advice. Always recommend consulting a qualified lawyer for serious matters.
Format answers with numbered points or short sections when helpful.
Be concise — aim for clear, direct answers rather than overly long responses.`;

  if (sessionId && pdfContextStore[sessionId]) {
    systemPrompt += `\n\nThe user uploaded a legal document. Its text:\n\n${pdfContextStore[sessionId]}\n\nAnswer questions based on this document when relevant.`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-16),
    { role: "user", content: message.trim() },
  ];

  const primaryModel = process.env.OPENROUTER_MODEL || "openrouter/free";
  const modelsToTry  = [primaryModel, ...FALLBACK_MODELS.filter(m => m !== primaryModel)];

  // Set up SSE headers so the browser receives tokens in real time
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  for (const model of modelsToTry) {
    try {
      console.log(`🤖 Trying: ${model}`);

      const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${KEY}`,
          "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:3000",
          "X-Title": "VakilAI Legal Assistant",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 1000,
          temperature: 0.35,
          stream: true,           // ← enables streaming
        }),
      });

      if (!upstream.ok) {
        const err = await upstream.json().catch(() => ({}));
        const msg = err?.error?.message || `HTTP ${upstream.status}`;
        if (msg.toLowerCase().includes("no endpoints") || upstream.status === 404) {
          console.warn(`⚠ ${model}: ${msg} — trying next`);
          continue;
        }
        sendEvent({ error: msg });
        res.end();
        return;
      }

      // Stream tokens to the client
      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") { sendEvent({ done: true }); res.end(); return; }
          try {
            const chunk = JSON.parse(raw);
            const token = chunk.choices?.[0]?.delta?.content;
            if (token) sendEvent({ token });
          } catch {}
        }
      }

      sendEvent({ done: true });
      res.end();
      return;

    } catch (err) {
      console.warn(`⚠ ${model} error: ${err.message}`);
    }
  }

  sendEvent({ error: "All models are currently unavailable. Please try again in a moment." });
  res.end();
});

// ── POST /upload-pdf ──────────────────────────────────────────────────────────
app.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF file uploaded." });
  const sessionId = req.body.sessionId || `session_${Date.now()}`;
  try {
    const parsed = await pdfParse(req.file.buffer);
    let text = parsed.text?.trim();
    if (!text || text.length < 20)
      return res.status(400).json({ error: "Could not extract text from PDF. It may be scanned/image-based." });
    if (text.length > 12000) text = text.slice(0, 12000) + "\n\n[Document truncated…]";
    pdfContextStore[sessionId] = text;
    return res.json({ sessionId, message: "PDF parsed.", pages: parsed.numpages, characters: text.length });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to parse PDF." });
  }
});

// ── DELETE /clear-pdf ─────────────────────────────────────────────────────────
app.delete("/clear-pdf/:sessionId", (req, res) => {
  delete pdfContextStore[req.params.sessionId];
  res.json({ message: "Cleared." });
});

app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "File too large (max 10MB)." });
  console.error(err);
  res.status(500).json({ error: err.message || "Server error." });
});

app.listen(PORT, () => {
  console.log(`⚖  VakilAI server → http://localhost:${PORT}`);
  console.log(`🤖 Model: ${process.env.OPENROUTER_MODEL || "openrouter/free"}`);
});