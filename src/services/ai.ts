import { IAiAnalysis, TicketCategory, TicketPriority } from "../models/Ticket.js";

export interface TicketInputForAi {
  title: string;
  description: string;
  category?: string;
  priority?: string;
}

export function analyzeTicketHeuristically(
  input: TicketInputForAi
): IAiAnalysis {
  const fullText = `${input.title} ${input.description}`.toLowerCase();

  const angryWords = [
    "furious", "angry", "terrible", "worst", "unacceptable", "scam",
    "ridiculous", "sue", "lawsuit", "refund now", "cancel subscription",
    "disaster", "horrible", "broken for days", "lost money", "urgent",
    "emergency", "down", "crash", "hacked", "stolen", "churi", "harassment",
    "unjustified", "why deactivated"
  ];

  const negativeWords = [
    "not working", "fails", "failed", "bug", "error", "problem", "glitch",
    "slow", "cannot", "can't", "unable", "frustrated", "delay", "waiting",
    "disappointed", "stuck", "wrong", "missing", "deactivate", "deactivated",
    "deactivating", "suspended", "suspend", "banned", "ban", "blocked", "block",
    "disabled", "disable", "locked", "lost access", "denied", "cannot login",
    "cant login", "solve koro", "keno", "somossa", "somossha", "bondho",
    "kaj kore na", "kaj korche na", "problem hocche", "help koro"
  ];

  const positiveWords = [
    "thanks", "thank you", "great", "awesome", "appreciate", "helpful",
    "love", "quick", "fixed", "good", "dhonnobad"
  ];

  const billingWords = [
    "charge", "charged", "billing", "invoice", "payment", "credit card",
    "refund", "subscription", "pricing", "dollar", "taka", "receipt", "pay",
    "bkash", "nagad", "kete nise", "keteche"
  ];

  const techWords = [
    "api", "server", "crash", "database", "500", "404", "stack trace",
    "exception", "code", "latency", "timeout", "frontend", "backend",
    "deploy", "docker", "bug", "outage", "downtime"
  ];

  const accountWords = [
    "account", "login", "password", "reset", "2fa", "otp", "profile", "access",
    "permission", "locked", "email change", "authenticate", "deactivate",
    "deactivated", "suspended", "suspend", "banned", "ban", "blocked", "disabled",
    "reactivate", "reactivation", "unban", "kyc", "verification", "user", "akount", "khata"
  ];

  let angryCount = 0;
  for (const w of angryWords) {
    if (fullText.includes(w)) angryCount++;
  }

  let negCount = 0;
  for (const w of negativeWords) {
    if (fullText.includes(w)) negCount++;
  }

  let posCount = 0;
  for (const w of positiveWords) {
    if (fullText.includes(w)) posCount++;
  }

  let sentimentScore = 0;
  if (angryCount > 0) {
    sentimentScore = -0.5 - Math.min(0.5, angryCount * 0.15);
  } else if (negCount > 0) {
    sentimentScore = -0.2 - Math.min(0.6, negCount * 0.12) + posCount * 0.1;
  } else if (posCount > 0) {
    sentimentScore = Math.min(0.9, 0.3 + posCount * 0.2);
  }

  sentimentScore = Math.max(-1, Math.min(1, Math.round(sentimentScore * 100) / 100));

  let sentiment: IAiAnalysis["sentiment"] = "NEUTRAL";
  if (angryCount >= 2 || sentimentScore <= -0.6) {
    sentiment = "FRUSTRATED";
  } else if (sentimentScore <= -0.2) {
    sentiment = "NEGATIVE";
  } else if (sentimentScore >= 0.2) {
    sentiment = "POSITIVE";
  }

  let recommendedCategory: TicketCategory = "GENERAL";
  const billingScore = billingWords.filter((w) => fullText.includes(w)).length;
  const techScore = techWords.filter((w) => fullText.includes(w)).length;
  const accountScore = accountWords.filter((w) => fullText.includes(w)).length;

  if (techScore >= billingScore && techScore >= accountScore && techScore > 0) {
    recommendedCategory = "TECHNICAL";
  } else if (billingScore >= techScore && billingScore >= accountScore && billingScore > 0) {
    recommendedCategory = "BILLING";
  } else if (accountScore > 0) {
    recommendedCategory = "ACCOUNT";
  }

  let urgencyScore = 30;
  if (sentiment === "FRUSTRATED") urgencyScore += 45;
  else if (sentiment === "NEGATIVE") urgencyScore += 25;
  if (angryCount > 0) urgencyScore += 20;
  if (fullText.includes("urgent") || fullText.includes("immediately") || fullText.includes("outage")) {
    urgencyScore += 25;
  }
  if (
    fullText.includes("deactivate") ||
    fullText.includes("deactivated") ||
    fullText.includes("suspend") ||
    fullText.includes("banned") ||
    fullText.includes("blocked") ||
    fullText.includes("locked") ||
    fullText.includes("hacked")
  ) {
    urgencyScore += 30;
  }
  urgencyScore = Math.min(100, Math.max(10, urgencyScore));

  let recommendedPriority: TicketPriority = "MEDIUM";
  if (urgencyScore >= 80) recommendedPriority = "URGENT";
  else if (urgencyScore >= 60) recommendedPriority = "HIGH";
  else if (urgencyScore <= 35) recommendedPriority = "LOW";

  const autoEscalateRecommended = urgencyScore >= 80 || sentiment === "FRUSTRATED";
  const escalationReason = autoEscalateRecommended
    ? `NLP identified high customer distress (${sentiment}) and urgency score of ${urgencyScore}/100.`
    : "";

  const extractedWords = [...angryWords, ...negativeWords, ...billingWords, ...techWords, ...accountWords];
  const keyIssues = Array.from(
    new Set(extractedWords.filter((w) => fullText.includes(w)).slice(0, 5))
  );

  const suggestedReply = `Hello,\n\nThank you for reaching out to our support team regarding "${input.title}". We sincerely acknowledge the issue you are experiencing${
    keyIssues.length > 0 ? ` with ${keyIssues.slice(0, 2).join(" and ")}` : ""
  }.\n\nOur team has categorized this as a ${recommendedPriority} priority ${recommendedCategory} matter. We are actively investigating and will provide an update shortly.\n\nBest regards,\nCustomer Operations Support`;

  return {
    sentiment,
    sentimentScore,
    urgencyScore,
    recommendedCategory,
    recommendedPriority,
    autoEscalateRecommended,
    escalationReason,
    suggestedReply,
    keyIssues,
    modelUsed: "heuristic-nlp-engine",
    analyzedAt: new Date(),
  };
}

export async function analyzeTicketWithAi(
  input: TicketInputForAi
): Promise<IAiAnalysis> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  const promptText = `You are an AI Support Triage Specialist. Analyze this ticket and return STRICT JSON with NO MARKDOWN OR BACKTICKS:
Title: "${input.title}"
Description: "${input.description}"

Expected Schema:
{
  "sentiment": "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "FRUSTRATED",
  "sentimentScore": <number between -1.0 and 1.0>,
  "urgencyScore": <integer 0-100>,
  "recommendedCategory": "TECHNICAL" | "BILLING" | "ACCOUNT" | "GENERAL",
  "recommendedPriority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
  "autoEscalateRecommended": <boolean>,
  "escalationReason": "<reason if true else empty>",
  "keyIssues": ["<issue1>", "<issue2>"],
  "suggestedReply": "<helpful empathic response draft ready for agent>"
}`;

  // 1. First try Google Gemini 3.8 Flash
  if (geminiKey && geminiKey.trim().length > 10) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { temperature: 0.2 },
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (rawText) {
          const cleanJson = rawText.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          const parsed = JSON.parse(cleanJson);
          return {
            sentiment: parsed.sentiment || "NEUTRAL",
            sentimentScore: Number(parsed.sentimentScore) || 0,
            urgencyScore: Number(parsed.urgencyScore) || 50,
            recommendedCategory: parsed.recommendedCategory || "GENERAL",
            recommendedPriority: parsed.recommendedPriority || "MEDIUM",
            autoEscalateRecommended: Boolean(parsed.autoEscalateRecommended),
            escalationReason: parsed.escalationReason || "",
            suggestedReply: parsed.suggestedReply || "",
            keyIssues: Array.isArray(parsed.keyIssues) ? parsed.keyIssues : [],
            modelUsed: "gemini-3.8-flash",
            analyzedAt: new Date(),
          };
        }
      }
    } catch (err) {
      console.warn("[AI] Gemini API request failed, trying Groq fallback:", err);
    }
  }

  // 2. Groq Fallback (openai/gpt-oss-20b)
  if (groqKey && groqKey.trim().length > 10) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqKey}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-20b",
          messages: [
            {
              role: "system",
              content: "You are an AI Support Triage engine. Always return valid raw JSON only, no markdown formatting.",
            },
            { role: "user", content: promptText },
          ],
          temperature: 0.2,
        }),
      });

      if (response.ok) {
        const groqData = await response.json();
        const content = groqData.choices?.[0]?.message?.content?.trim();
        if (content) {
          const cleanJson = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
          const parsed = JSON.parse(cleanJson);
          return {
            sentiment: parsed.sentiment || "NEUTRAL",
            sentimentScore: Number(parsed.sentimentScore) || 0,
            urgencyScore: Number(parsed.urgencyScore) || 50,
            recommendedCategory: parsed.recommendedCategory || "GENERAL",
            recommendedPriority: parsed.recommendedPriority || "MEDIUM",
            autoEscalateRecommended: Boolean(parsed.autoEscalateRecommended),
            escalationReason: parsed.escalationReason || "",
            suggestedReply: parsed.suggestedReply || "",
            keyIssues: Array.isArray(parsed.keyIssues) ? parsed.keyIssues : [],
            modelUsed: "groq-openai-gpt-oss",
            analyzedAt: new Date(),
          };
        }
      }
    } catch (grokErr) {
      console.warn("[AI] Groq API request failed, falling back to heuristics:", grokErr);
    }
  }

  // 3. Fallback Heuristics
  return analyzeTicketHeuristically(input);
}
