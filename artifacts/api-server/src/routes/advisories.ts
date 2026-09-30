import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  CreateAdvisoryBody,
  CreateAdvisoryResponse,
  DeleteAdvisoryParams,
  GetAdvisoryParams,
  GetAdvisoryResponse,
  ListAdvisoriesResponse,
} from "@workspace/api-zod";
import { advisoriesTable, db, marketObservationsTable } from "@workspace/db";
import { currentUserId, requireAuth } from "../middlewares/require-auth";
import { aiLimiter } from "../lib/limits";
import { generateAdvisory } from "../lib/ai";

const router: IRouter = Router();

function toAdvisory(row: typeof advisoriesTable.$inferSelect) {
  return {
    id: row.id,
    crop: row.crop,
    region: row.region,
    season: row.season,
    createdAt: row.createdAt.toISOString(),
    report: row.report,
  };
}

router.get("/advisories", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(advisoriesTable)
    .where(eq(advisoriesTable.userId, currentUserId(req)))
    .orderBy(desc(advisoriesTable.createdAt));
  res.json(ListAdvisoriesResponse.parse(rows.map(toAdvisory)));
});

router.post("/advisories", requireAuth, aiLimiter, async (req, res): Promise<void> => {
  const parsed = CreateAdvisoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the crop plan inputs and try again." });
    return;
  }
  const input = parsed.data;
  const userId = currentUserId(req);
  const [marketPrice] = await db
    .select({
      price: marketObservationsTable.price,
      unit: marketObservationsTable.unit,
      currency: marketObservationsTable.currency,
      observedAt: marketObservationsTable.observedAt,
    })
    .from(marketObservationsTable)
    .where(
      and(
        eq(marketObservationsTable.userId, userId),
        eq(marketObservationsTable.crop, input.crop),
        eq(marketObservationsTable.region, input.region),
      ),
    )
    .orderBy(desc(marketObservationsTable.observedAt))
    .limit(1);
  const report = await generateAdvisory({
    ...input,
    latestMarketPrice: marketPrice
      ? {
          price: marketPrice.price,
          unit: marketPrice.unit,
          currency: marketPrice.currency,
          observedAt: marketPrice.observedAt.toISOString().slice(0, 10),
        }
      : null,
  });
  const [row] = await db
    .insert(advisoriesTable)
    .values({
      id: randomUUID(),
      userId,
      crop: input.crop,
      region: input.region,
      season: input.season,
      input,
      report,
    })
    .returning();
  res.status(201).json(CreateAdvisoryResponse.parse(toAdvisory(row)));
});

router.get("/advisories/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetAdvisoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid advisory id." });
    return;
  }
  const [row] = await db
    .select()
    .from(advisoriesTable)
    .where(and(eq(advisoriesTable.id, parsed.data.id), eq(advisoriesTable.userId, currentUserId(req))))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Advisory not found." });
    return;
  }
  res.json(GetAdvisoryResponse.parse(toAdvisory(row)));
});

router.delete("/advisories/:id", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteAdvisoryParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid advisory id." });
    return;
  }
  const [deleted] = await db
    .delete(advisoriesTable)
    .where(and(eq(advisoriesTable.id, parsed.data.id), eq(advisoriesTable.userId, currentUserId(req))))
    .returning({ id: advisoriesTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Advisory not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;