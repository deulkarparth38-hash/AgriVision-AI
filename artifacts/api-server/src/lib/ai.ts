import { GoogleGenAI } from "@google/genai";
import { z } from "zod/v4";

const advisoryReportSchema = z.object({
  overview: z.string(),
  cropPlan: z.array(
    z.object({
      stage: z.string(),
      timing: z.string(),
      action: z.string(),
      materials: z.string(),
      amount: z.string(),
      caution: z.string(),
    }),
  ),
  nutrientPlan: z.array(
    z.object({
      nutrient: z.string(),
      recommendation: z.string(),
      timing: z.string(),
      basis: z.string(),
    }),
  ),
  diseaseRisks: z.array(
    z.object({
      concern: z.string(),
      likelihood: z.enum(["low", "moderate", "high"]),
      signals: z.string(),
      prevention: z.string(),
    }),
  ),
  roi: z.object({
    estimatedYield: z.number(),
    yieldUnit: z.string(),
    expectedRevenue: z.number(),
    estimatedCosts: z.number(),
    estimatedNet: z.number(),
    breakEvenPrice: z.number(),
    assumptions: z.array(z.string()),
  }),
  confidence: z.enum(["low", "moderate", "high"]),
  assumptions: z.array(z.string()),
  disclaimer: z.string(),
});

const diagnosisReportSchema = z.object({
  likelyIssue: z.string(),
  confidence: z.enum(["low", "moderate", "high"]),
  severity: z.number().int().min(1).max(5),
  observations: z.array(z.string()),
  possibleCauses: z.array(z.string()),
  actions: z.array(
    z.object({
      type: z.enum(["cultural", "biological", "chemical", "monitoring"]),
      action: z.string(),
      timing: z.string(),
      caution: z.string(),
    }),
  ),
  escalation: z.string(),
  disclaimer: z.string(),
});

let client: GoogleGenAI | undefined;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini is not configured. Add GEMINI_API_KEY in Secrets.");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

type GeminiPart = { text: string } | { inlineData: { data: string; mimeType: string } };

async function generateJson<T>(
  parts: GeminiPart[],
  schema: z.ZodType<T>,
  label: string,
): Promise<T> {
  const response = await getClient().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [{ role: "user", parts }],
    config: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned an empty ${label}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Gemini returned invalid JSON for ${label}.`);
  }
  return schema.parse(parsed);
}

export async function generateAdvisory(input: {
  crop: string;
  region: string;
  country: string;
  season: string;
  areaHa: number;
  soilType: string | null;
  soilPH: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  organicCarbonPct: number | null;
  irrigation: string;
  budgetPerHa: number | null;
  currency: string;
  latestMarketPrice?: { price: number; unit: string; currency: string; observedAt: string } | null;
}): Promise<z.infer<typeof advisoryReportSchema>> {
  const prompt = [
    "You are an agronomy assistant preparing a cautious, practical crop plan. Return only JSON matching the requested fields.",
    "Use metric units. Never invent laboratory measurements, live weather, or current market prices. If data is missing, state the assumption.",
    "For ROI, estimate as a scenario, not a guarantee; use the supplied latest market observation only when its units are compatible and mention its date. If no price is supplied, make the lack of a verified price explicit in assumptions.",
    "Do not prescribe a specific pesticide brand or unsupported chemical dose. For any chemical option, advise checking local registration, product label, protective equipment, and a local agronomist. Prefer integrated pest management.",
    "Keep the answer understandable to a farmer. The JSON fields are overview, cropPlan (stage,timing,action,materials,amount,caution), nutrientPlan (nutrient,recommendation,timing,basis), diseaseRisks (concern,likelihood low/moderate/high,signals,prevention), roi (estimatedYield,yieldUnit,expectedRevenue,estimatedCosts,estimatedNet,breakEvenPrice,assumptions), confidence (low/moderate/high), assumptions, disclaimer.",
    `Farm inputs: ${JSON.stringify(input)}`,
  ].join("\n\n");
  return generateJson([{ text: prompt }], advisoryReportSchema, "advisory");
}

export async function diagnosePlant(input: {
  crop: string | null;
  region: string | null;
  symptoms: string | null;
  mimeType: string;
  imageData: string;
}): Promise<z.infer<typeof diagnosisReportSchema>> {
  const prompt = [
    "Assess the attached crop photo as a cautious plant-health triage assistant. Return only JSON.",
    "Do not claim certainty from an image alone. Distinguish visible signs from possible causes and use low confidence when evidence is weak.",
    "Return fields: likelyIssue, confidence (low/moderate/high), severity (integer 1-5), observations, possibleCauses, actions (type cultural/biological/chemical/monitoring, action, timing, caution), escalation, disclaimer.",
    "Do not recommend pesticide brands or unsupported chemical doses. If any chemical treatment is mentioned, defer to locally registered products and the label, with protective equipment. Include a safe next step and advise professional diagnosis when appropriate.",
    `Crop context: ${JSON.stringify({ crop: input.crop, region: input.region, symptoms: input.symptoms })}`,
  ].join("\n\n");
  return generateJson(
    [
      { text: prompt },
      { inlineData: { data: input.imageData, mimeType: input.mimeType } },
    ],
    diagnosisReportSchema,
    "diagnosis",
  );
}

export async function answerAgronomyQuestion(input: {
  question: string;
  profile: Record<string, unknown> | null;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<string> {
  const conversation = input.history
    .map((item) => `${item.role === "assistant" ? "AgriBot" : "Farmer"}: ${item.content}`)
    .join("\n");
  const response = await getClient().models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              "You are AgriBot, a cautious, practical agronomy assistant. Answer in plain language, prioritize low-risk integrated pest management, and do not invent local regulations, live weather, or market data.",
              "Ask a clarifying question when crop, growth stage, symptoms, or location materially changes the answer. Avoid brand-specific pesticide advice and unsupported dosage. For urgent or severe crop damage, advise local extension support.",
              `Farm profile context: ${JSON.stringify(input.profile)}`,
              `Recent conversation:\n${conversation}`,
              `Farmer's current question: ${input.question}`,
            ].join("\n\n"),
          },
        ],
      },
    ],
    config: { temperature: 0.4 },
  });
  const answer = response.text?.trim();
  if (!answer) {
    throw new Error("Gemini returned an empty chat response.");
  }
  return answer;
}