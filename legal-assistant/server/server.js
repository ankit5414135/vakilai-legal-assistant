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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ─── POST /chat ───────────────────────────────────────────────────────────────
app.post("/chat", async (req, res) => {
  const { message, history = [], sessionId } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return res.status(400).json({ error: "Message is required and must be a non-empty string." });
  }
  if (message.trim().length > 2000) {
    return res.status(400).json({ error: "Message is too long. Please keep it under 2000 characters." });
  }

  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY.includes("your-openrouter")) {
    return res.status(500).json({
      error: "OpenRouter API key is not set. Please add OPENROUTER_API_KEY to your .env file.",
    });
  }

  // Build system prompt
  let systemPrompt = `You are a legal assistant specialized in Indian law. Provide accurate, simple, and helpful legal information.
Do not give harmful or illegal advice. Always recommend consulting a qualified lawyer for serious legal matters.
When explaining laws, use simple language that a layperson can understand.
Structure your answers clearly using numbered points or sections when appropriate.`;

  if (sessionId && pdfContextStore[sessionId]) {
    systemPrompt += `\n\nThe user has uploaded a PDF legal document. Here is its content for reference:\n\n${pdfContextStore[sessionId]}\n\nAnswer questions based on this document when relevant.`;
  }

  const recentHistory = history.slice(-20);
  const messages = [
    { role: "system", content: systemPrompt },
    ...recentHistory,
    { role: "user", content: message.trim() },
  ];

  // "openrouter/free" automatically picks any currently available free model.
  // This means it NEVER throws "no endpoints" errors regardless of which
  // specific models OpenRouter adds or removes from their free tier.
  const model = process.env.OPENROUTER_MODEL || "openrouter/free";

  try {
    console.log(`🤖 Sending request via model: ${model}`);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.CLIENT_URL || "http://localhost:3000",
        "X-Title": "VakilAI Legal Assistant",
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 1200,
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `OpenRouter error: ${response.status}`;
      console.error("OpenRouter API error:", errMsg);
      return res.status(502).json({ error: errMsg });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: "Empty response from AI model. Please try again." });
    }

    console.log(`✅ Response received from: ${data.model}`);
    return res.json({ reply, model: data.model, tokens: data.usage });

  } catch (err) {
    console.error("Chat error:", err.message);
    return res.status(500).json({ error: "Internal server error. Please try again." });
  }
});

// ─── POST /upload-pdf ─────────────────────────────────────────────────────────
app.post("/upload-pdf", upload.single("pdf"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF file uploaded." });

  const sessionId = req.body.sessionId || `session_${Date.now()}`;

  try {
    const parsed = await pdfParse(req.file.buffer);
    let text = parsed.text?.trim();

    if (!text || text.length < 20) {
      return res.status(400).json({
        error: "Could not extract readable text from this PDF. It may be scanned/image-based.",
      });
    }

    if (text.length > 12000) {
      text = text.slice(0, 12000) + "\n\n[Document truncated due to length...]";
    }

    pdfContextStore[sessionId] = text;

    return res.json({
      sessionId,
      message: "PDF uploaded and parsed successfully.",
      pages: parsed.numpages,
      characters: text.length,
      preview: text.slice(0, 200) + (text.length > 200 ? "..." : ""),
    });
  } catch (err) {
    console.error("PDF parse error:", err);
    return res.status(500).json({ error: "Failed to parse PDF. Please try another file." });
  }
});

// ─── DELETE /clear-pdf ────────────────────────────────────────────────────────
app.delete("/clear-pdf/:sessionId", (req, res) => {
  delete pdfContextStore[req.params.sessionId];
  res.json({ message: "PDF context cleared." });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.code === "LIMIT_FILE_SIZE") {
    return res.status(400).json({ error: "File too large. Max size is 10MB." });
  }
  console.error(err);
  res.status(500).json({ error: err.message || "Unexpected server error." });
});

app.listen(PORT, () => {
  console.log(`⚖️  VakilAI server running on http://localhost:${PORT}`);
  console.log(`🤖 Model: ${process.env.OPENROUTER_MODEL || "openrouter/free (auto-select)"}`);
});