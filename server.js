import "dotenv/config";
import express from "express";
import multer from "multer";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// API anahtarı .env dosyasından okunur (ANTHROPIC_API_KEY)
const anthropic = new Anthropic();

// index.html ve diğer statik dosyaları yerelde sunmak için
app.use(express.static("."));

// Claude'un doldurmak ZORUNDA olduğu JSON şeması.
// historianMode alanı index.html'deki renderAnalysis() ile birebir uyumludur.
const analysisSchema = {
  type: "object",
  properties: {
    observe: {
      type: "array",
      items: { type: "string" },
      description: "Strict description of physical items, clothes, architecture without speculation. 2-4 short paragraphs."
    },
    decode: {
      type: "array",
      items: { type: "string" },
      description: "Historical era analysis, clothing styles, and photographic technology analysis. 2-4 short paragraphs."
    },
    reconstruct: {
      type: "array",
      items: { type: "string" },
      description: "Responsible speculative reconstruction of the moments before and after the photo. 2-4 short paragraphs."
    },
    atmosphere: {
      type: "array",
      items: { type: "string" },
      description: "Sensory details like sounds, smells, temperature, and emotional tone. 2-4 short paragraphs."
    },
    narrative: {
      type: "string",
      description: "A short, immersive historical fiction vignette based on the photo (one paragraph)."
    },
    historianMode: {
      type: "object",
      properties: {
        observe: { type: "string", description: "What we can directly observe in the photograph." },
        infer:   { type: "string", description: "What we can reasonably infer from the evidence." },
        unknown: { type: "string", description: "What cannot be known from this photograph alone." }
      },
      required: ["observe", "infer", "unknown"]
    }
  },
  required: ["observe", "decode", "reconstruct", "atmosphere", "narrative", "historianMode"]
};

// Akademik Tarihçi Rolü (System Prompt)
const systemPrompt = `You are a meticulous academic historian and senior image archivist.
Analyze the uploaded historical photograph layer by layer using strict historiographical methods:
1. Observe: List verifiable physical objects, architectural details, and clothing styles.
2. Decode: Identify the historical era, regional context, and social standing of individuals.
3. Reconstruct: Speculate responsibly on the immediate historical context.
4. Atmosphere: Evoke the sensory and emotional tone of the setting.
5. Narrative: Write a brief, vivid historical vignette.
6. Historian Mindset: Separate what is directly observable, what can be inferred, and what cannot be known.
Always deliver your complete analysis via the deliver_analysis tool.`;

// Analiz çıktısının dili (frontend'den 'lang' alanı ile gelir)
const LANG_NAMES = { tr: "Turkish", de: "German", en: "English" };

// Frontend'den gelen resmi karşılayan ve Claude'a gönderen API Ucu
app.post("/api/analyze", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      console.error("[HATA] Frontend sunucuya dosya göndermedi!");
      return res.status(400).json({ error: "No historical anchor file uploaded." });
    }

    console.log(`[BİLGİ] Fotoğraf alındı (${req.file.mimetype}). Claude API'sine gönderiliyor...`);

    // Seçilen dil (varsayılan: İngilizce). Analizin TÜM metni bu dilde üretilir.
    const lang = (req.body && req.body.lang) || "en";
    const langName = LANG_NAMES[lang] || "English";
    const localizedSystem = systemPrompt +
      `\n\nLANGUAGE REQUIREMENT: Write ALL textual content of every field ` +
      `(observe, decode, reconstruct, atmosphere, narrative, and every historianMode field) ` +
      `entirely in ${langName}, using natural and fluent ${langName}. ` +
      `Do NOT use any other language in the output. ` +
      `Keep the JSON structure, the tool name, and all field/key names exactly as defined (in English).`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: localizedSystem,
      tools: [
        {
          name: "deliver_analysis",
          description: "Deliver the complete structured historical analysis of the photograph.",
          input_schema: analysisSchema
        }
      ],
      tool_choice: { type: "tool", name: "deliver_analysis" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: req.file.mimetype,
                data: req.file.buffer.toString("base64")
              }
            },
            {
              type: "text",
              text: "Analyze this historical photograph and deliver the full structured report."
            }
          ]
        }
      ]
    });

    // Yapılandırılmış JSON verisi tool_use bloğundadır
    const toolBlock = response.content.find(block => block.type === "tool_use");

    if (!toolBlock) {
      throw new Error("Claude yapılandırılmış analiz verisi döndürmedi.");
    }

    console.log("[BAŞARI] Claude analizi tamamladı, JSON verisi döndü.");
    res.json(toolBlock.input);

  } catch (error) {
    console.error("\n=== CLAUDE ANALİZ MOTORU HATASI ===");
    console.error(error);
    console.error("====================================\n");

    res.status(500).json({ error: error.message || "Zaman akışı analiz edilirken bir hata oluştu." });
  }
});

const PORT = process.env.PORT || 3000;

function startServer() {
  const server = app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 YAMA Chrono-Server running on port ${PORT}`);
    console.log(`🔗 Adres: http://localhost:${PORT}`);
    console.log(`🤖 Motor: Claude (Anthropic API)`);
    console.log(`==================================================\n`);
  });

  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
}

startServer();
