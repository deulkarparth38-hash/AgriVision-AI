import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  CreateDiagnosisBody,
  CreateDiagnosisResponse,
  DeleteDiagnosisParams,
  GetDiagnosisParams,
  GetDiagnosisResponse,
  ListDiagnosesResponse,
} from "@workspace/api-zod";
import { db, diagnosesTable } from "@workspace/db";
import { currentUserId, requireAuth } from "../middlewares/require-auth";
import { aiLimiter } from "../lib/limits";
import { diagnosePlant } from "../lib/ai";

const router: IRouter = Router();
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function toDiagnosis(row: typeof diagnosesTable.$inferSelect) {
  return {
    id: row.id,
    crop: row.crop,
    region: row.region,
    createdAt: row.createdAt.toISOString(),
    report: row.report,
  };
}

function decodeImage(imageData: string): Buffer | null {
  const match = imageData.match(/^data:image\/(?:jpeg|png|webp);base64,(.*)$/i);
  const encoded = match ? match[1] : imageData;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return null;
  const buffer = Buffer.from(encoded, "base64");
  return buffer.length > 0 && buffer.length <= MAX_IMAGE_BYTES ? buffer : null;
}

router.get("/diagnoses", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(diagnosesTable)
    .where(eq(diagnosesTable.userId, currentUserId(req)))
    .orderBy(desc(diagnosesTable.createdAt));
  res.json(ListDiagnosesResponse.parse(rows.map(toDiagnosis)));
});

router.post("/diagnoses", requireAuth, aiLimiter, async (req, res): Promise<void> => {
  const parsed = CreateDiagnosisBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Choose a supported image and try again." });
    return;
  }
  const input = parsed.data;
  const image = decodeImage(input.imageData);
  if (!image) {
    res.status(400).json({ error: "The image must be a valid JPEG, PNG, or WebP under 5 MB." });
    return;
  }
  const report = await diagnosePlant({
    crop: input.crop ?? null,
    region: input.region ?? null,
    symptoms: input.symptoms ?? null,
    mimeType: input.mimeType,
    imageData: input.imageData.replace(/^data:image\/(?:jpeg|png|webp);base64,/i, ""),
  });
  const [row] = await db
    .insert(diagnosesTable)
    .values({
      id: randomUUID(),
      userId: currentUserId(req),
      crop: input.crop,
      region: input.region,
      report,
    })
    .returning();
  res.status(201).json(CreateDiagnosisResponse.parse(toDiagnosis(row)));
});

router.get("/diagnoses/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetDiagnosisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid diagnosis id." });
    return;
  }
  const [row] = await db
    .select()
    .from(diagnosesTable)
    .where(and(eq(diagnosesTable.id, parsed.data.id), eq(diagnosesTable.userId, currentUserId(req))))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Diagnosis not found." });
    return;
  }
  res.json(GetDiagnosisResponse.parse(toDiagnosis(row)));
});

router.delete("/diagnoses/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteDiagnosisParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid diagnosis id." });
    return;
  }
  const [deleted] = await db
    .delete(diagnosesTable)
    .where(and(eq(diagnosesTable.id, parsed.data.id), eq(diagnosesTable.userId, currentUserId(req))))
    .returning({ id: diagnosesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Diagnosis not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;