require("dotenv").config();
const express = require("express");
const multer = require("multer");
const OpenAI = require("openai");
const sharp = require("sharp");
const {
  RekognitionClient,
  DetectModerationLabelsCommand
} = require("@aws-sdk/client-rekognition");

const { evaluateDecision } = require("./decisionEngine");

const REKOGNITION_MAX_BYTES = 5 * 1024 * 1024;

const app = express();
const upload = multer();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION
});

app.use(express.static("public"));

/* -------------------------
   SAFE JSON PARSE
-------------------------- */
function safeJsonParse(content) {
  try {
    const cleaned = content
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return JSON.parse(cleaned);
  } catch (err) {
    return null;
  }
}

/* -------------------------
   TEXT FALLBACK EXPLANATION
-------------------------- */
function ensureTextExplanation(result) {
  if (!result || typeof result !== "object") return null;

  const existing =
    result.explanation?.trim() ||
    result.reason?.trim() ||
    result.summary?.trim() ||
    "";
  if (existing) {
    result.explanation = existing;
    return result;
  }

  // fallback explanation
  result.explanation =
    result.severity === "low"
      ? "Text appears safe and does not violate content policies."
      : result.severity === "medium"
      ? "Text contains potentially sensitive or borderline language."
      : result.severity === "high"
      ? "Text contains harmful or policy-violating language."
      : "Text contains critical violations requiring immediate rejection.";

  return result;
}

/* -------------------------
   IMAGE SIZE FOR REKOGNITION (max 5 MB)
-------------------------- */
async function ensureImageWithinLimit(buffer) {
  if (buffer.length <= REKOGNITION_MAX_BYTES) return buffer;
  let width = 1920;
  let quality = 82;
  for (let attempt = 0; attempt < 3; attempt++) {
    const out = await sharp(buffer)
      .resize(width, width, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.length <= REKOGNITION_MAX_BYTES) return out;
    width = Math.floor(width * 0.7);
    quality = Math.floor(quality * 0.85);
  }
  throw new Error("Image too large. Please use an image under 5 MB.");
}

/* -------------------------
   IMAGE NORMALIZATION + OUR OWN EXPLANATION
-------------------------- */
function normalizeRekognition(rekogResponse) {
  const labels = Array.isArray(rekogResponse?.ModerationLabels)
    ? rekogResponse.ModerationLabels
    : [];

  if (labels.length === 0) {
    return {
      severity: "low",
      confidence: 100,
      categories: [],
      explanation: "No unsafe content detected in image."
    };
  }

  let highestConfidence = 0;
  let highestLabel = "";

  for (const label of labels) {
    if (label.Confidence > highestConfidence) {
      highestConfidence = label.Confidence;
      highestLabel = label.Name;
    }
  }

  let severity = "low";
  if (highestConfidence >= 90) severity = "critical";
  else if (highestConfidence >= 80) severity = "high";
  else if (highestConfidence >= 60) severity = "medium";

  let explanation;

  if (severity === "low") {
    explanation = `Image appears safe. Detected "${highestLabel}" at low confidence (${highestConfidence.toFixed(1)}%).`;
  } else if (severity === "medium") {
    explanation = `Image contains potentially sensitive content: "${highestLabel}". Manual review recommended.`;
  } else if (severity === "high") {
    explanation = `Image contains harmful content: "${highestLabel}" detected with ${highestConfidence.toFixed(1)}% confidence.`;
  } else {
    explanation = `Image contains critical violation: "${highestLabel}" detected with ${highestConfidence.toFixed(1)}% confidence.`;
  }

  return {
    severity,
    confidence: highestConfidence,
    categories: [highestLabel],
    explanation
  };
}

/* -------------------------
   MODERATION ENDPOINT
-------------------------- */
app.post("/moderate", upload.single("image"), async (req, res) => {
  try {
    const text = req.body.text;
    const image = req.file;

    let textResult = null;
    let imageResult = null;

    // TEXT → OPENAI
    if (text && text.trim() !== "") {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `
You must respond with valid JSON only, no markdown or extra text. Use this exact shape:
{
  "severity": "low" or "medium" or "high" or "critical",
  "confidence": a number 0-100,
  "categories": array of strings or empty array,
  "explanation": "A clear 1-2 sentence explanation for the user of why this severity was chosen. Required."
}
Always include the "explanation" field with a non-empty string.
`
          },
          { role: "user", content: text }
        ],
        max_tokens: 300
      });

      const parsed = safeJsonParse(response.choices[0].message.content);
      const withFallback =
        parsed && typeof parsed === "object"
          ? ensureTextExplanation(parsed)
          : {
              severity: "medium",
              confidence: 0,
              categories: [],
              explanation:
                "Text was analyzed but the result could not be interpreted. Please try again."
            };
      textResult = withFallback;
    }

    // IMAGE → AWS (max 5 MB; resize if needed)
    if (image) {
      const imageBytes = await ensureImageWithinLimit(image.buffer);
      const command = new DetectModerationLabelsCommand({
        Image: { Bytes: imageBytes },
        MinConfidence: 50
      });

      const rekogResponse = await rekognition.send(command);
      imageResult = normalizeRekognition(rekogResponse);
    }

    const finalResult = evaluateDecision({
      text: textResult,
      image: imageResult
    });

    res.json({
      textModeration: textResult,
      imageModeration: imageResult,
      ...finalResult
    });

  } catch (err) {
    console.error(err);
    const isClientError =
      err.message?.includes("Image too large") ||
      err.name === "ValidationException";
    res
      .status(isClientError ? 400 : 500)
      .json({ error: err.message || "Moderation failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
