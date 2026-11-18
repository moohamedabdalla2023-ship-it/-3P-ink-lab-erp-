// INK LAB ERP — inspect-route.js
// Gemini Vision endpoint (free tier) for Sample Inspection (reference vs production sample).
// The API key stays on the server (never in the browser).
//
// Setup in server.js:
//   app.use(express.json({ limit: "30mb" }));          // replace the old app.use(express.json())
//   require("./inspect-route")(app, express);          // add before app.listen
//
// Env vars:
//   GEMINI_API_KEY      (required — free key from aistudio.google.com)
//   APP_TOKEN           (recommended — the same token is typed in the page, blocks strangers from using your key)
//   INSPECT_MODEL       (optional, default gemini-2.5-flash)
// Needs Node 18+ (built-in fetch).

const MODEL = process.env.INSPECT_MODEL || "gemini-2.5-flash";

const SYSTEM = `You are a senior quality-control inspector for flexographic printing of packaging labels and films.
You receive two photos: image 1 = the APPROVED REFERENCE, image 2 = a PRODUCTION SAMPLE from the press.
Your job: find every real difference of the sample versus the reference, and every print defect visible in the sample.

Rules:
- Read ALL text in both images, including small print, ingredients, numbers, dates, weights, units, symbols (®, ™, ©, recycling icons, e-mark), barcodes' human-readable digits, and Arabic text. Compare character by character: spelling, digits, punctuation, diacritics, order, line breaks, missing/extra words.
- Check artwork: logos, icons, images, color of each element, element position/size, missing or extra elements, direction/orientation.
- Check print defects in the sample: color deviation of a specific element, misregistration (color fringing/double image), ghosting, bridging/fill-in of fine text, pinholes/voids, hickies/dirt specks, streaks/doctor-blade lines, smears/scumming, missing ink, mottle/uneven solids, heavy dot gain, blurry or broken text, cut-off/trim problems.
- IGNORE differences that come only from the photographs: lighting, white balance, shadows, glare, perspective, slight rotation, focus, image size. If you cannot tell, say so in the note.
- Be conservative and honest. Only report what you can actually see. Never invent text. If something is unreadable, mark it "unclear" and give low confidence instead of guessing.
- For each difference give the approximate location as a normalized bounding box in the SAMPLE image: [x, y, width, height], all values 0..1, origin top-left. Use null if not localizable.

Return ONLY one JSON object, no markdown, no extra text, with exactly this shape:
{
  "verdict": "pass" | "review" | "fail",
  "summary": "2-4 sentence overall assessment",
  "text_items": [
    { "ref": "text as in reference", "sample": "text as in sample ('' if missing)", "status": "match" | "mismatch" | "missing" | "extra" | "unclear", "note": "what differs" }
  ],
  "differences": [
    { "category": "text" | "color" | "registration" | "artwork" | "barcode" | "print_defect" | "layout" | "other",
      "severity": "critical" | "major" | "minor",
      "confidence": "high" | "medium" | "low",
      "description": "precise description",
      "location": "e.g. top-left, middle-center",
      "bbox": [x, y, w, h] | null }
  ],
  "image_quality_note": "anything about photo quality that limits accuracy"
}
Severity guide: critical = wrong/missing text or numbers, wrong barcode, wrong logo/artwork, clearly wrong color, or a defect that would cause rejection; major = visible defect or deviation needing review; minor = small, cosmetic.`;

function parseJson(text) {
    const s = text.indexOf("{"), e = text.lastIndexOf("}");
    if (s < 0 || e < 0) throw new Error("Model did not return JSON");
    return JSON.parse(text.slice(s, e + 1));
}

function toBlock(dataUrl) {
    const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl || "");
    if (!m) throw new Error("Invalid image data");
    return { inline_data: { mime_type: m[1], data: m[2] } };
}

module.exports = function registerInspect(app, express) {
    app.post("/api/inspect-images", async (req, res) => {
        try {
            if (!process.env.GEMINI_API_KEY)
                return res.status(500).json({ ok: false, error: "GEMINI_API_KEY is not set on the server" });

            if (process.env.APP_TOKEN && req.headers["x-app-token"] !== process.env.APP_TOKEN)
                return res.status(401).json({ ok: false, error: "Invalid access token" });

            const { ref_image, sample_image, context } = req.body || {};
            if (!ref_image || !sample_image)
                return res.status(400).json({ ok: false, error: "Both images are required" });

            const ctx = context ? `Job context: ${JSON.stringify(context)}.` : "";
            const body = {
                systemInstruction: { parts: [{ text: SYSTEM }] },
                contents: [{
                    role: "user",
                    parts: [
                        { text: "Image 1 — APPROVED REFERENCE:" },
                        toBlock(ref_image),
                        { text: "Image 2 — PRODUCTION SAMPLE:" },
                        toBlock(sample_image),
                        { text: `${ctx}\nCompare them now and return the JSON.` }
                    ]
                }],
                generationConfig: {
                    temperature: 0,
                    maxOutputTokens: 8000,
                    responseMimeType: "application/json"
                }
            };

            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 150000);

            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
                method: "POST",
                signal: ctrl.signal,
                headers: {
                    "content-type": "application/json",
                    "x-goog-api-key": process.env.GEMINI_API_KEY
                },
                body: JSON.stringify(body)
            });
            clearTimeout(timer);

            const data = await r.json();
            if (!r.ok) {
                console.error("Gemini error:", JSON.stringify(data));
                return res.status(502).json({ ok: false, error: data?.error?.message || "AI request failed" });
            }

            const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
            if (!text) return res.status(502).json({ ok: false, error: data?.promptFeedback?.blockReason ? "Blocked: " + data.promptFeedback.blockReason : "Empty AI response" });
            const result = parseJson(text);
            res.json({ ok: true, result, model: MODEL });
        } catch (e) {
            console.error("inspect-images:", e);
            res.status(500).json({ ok: false, error: e.name === "AbortError" ? "AI request timed out" : e.message });
        }
    });
};