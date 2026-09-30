import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  CreateMarketObservationBody,
  CreateMarketObservationResponse,
  DeleteMarketObservationParams,
  GetMarketSummaryQueryParams,
  GetMarketSummaryResponse,
  ListMarketObservationsQueryParams,
  ListMarketObservationsResponse,
} from "@workspace/api-zod";
import { db, marketObservationsTable } from "@workspace/db";
import { currentUserId, requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

function toObservation(row: typeof marketObservationsTable.$inferSelect) {
  return {
    id: row.id,
    crop: row.crop,
    region: row.region,
    market: row.market,
    unit: row.unit,
    currency: row.currency,
    price: row.price,
    observedAt: row.observedAt.toISOString().slice(0, 10),
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/market/observations", requireAuth, async (req, res): Promise<void> => {
  const params = ListMarketObservationsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Invalid crop price filters." });
    return;
  }
  const conditions = [eq(marketObservationsTable.userId, currentUserId(req))];
  if (params.data.crop) conditions.push(eq(marketObservationsTable.crop, params.data.crop));
  if (params.data.region) conditions.push(eq(marketObservationsTable.region, params.data.region));
  const rows = await db
    .select()
    .from(marketObservationsTable)
    .where(and(...conditions))
    .orderBy(desc(marketObservationsTable.observedAt))
    .limit(100);
  res.json(ListMarketObservationsResponse.parse(rows.map(toObservation)));
});

router.post("/market/observations", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMarketObservationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the price details and try again." });
    return;
  }
  const input = parsed.data;
  const [row] = await db
    .insert(marketObservationsTable)
    .values({
      ...input,
      id: randomUUID(),
      userId: currentUserId(req),
      observedAt: new Date(`${input.observedAt}T12:00:00.000Z`),
    })
    .returning();
  res.status(201).json(CreateMarketObservationResponse.parse(toObservation(row)));
});

router.get("/market/summary", requireAuth, async (req, res): Promise<void> => {
  const params = GetMarketSummaryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: "Choose a crop to review its market observations." });
    return;
  }
  const conditions = [
    eq(marketObservationsTable.userId, currentUserId(req)),
    eq(marketObservationsTable.crop, params.data.crop),
  ];
  if (params.data.region) conditions.push(eq(marketObservationsTable.region, params.data.region));
  const rows = await db
    .select()
    .from(marketObservationsTable)
    .where(and(...conditions))
    .orderBy(desc(marketObservationsTable.observedAt))
    .limit(100);
  const latest = rows[0];
  const previous = rows[1];
  const changePct =
    latest && previous && previous.price !== 0
      ? Number((((latest.price - previous.price) / previous.price) * 100).toFixed(2))
      : null;
  res.json(
    GetMarketSummaryResponse.parse({
      crop: params.data.crop,
      region: params.data.region ?? latest?.region ?? null,
      currency: latest?.currency ?? null,
      unit: latest?.unit ?? null,
      latestPrice: latest?.price ?? null,
      changePct,
      observations: rows.map(toObservation),
    }),
  );
});

router.delete("/market/observations/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteMarketObservationParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid observation id." });
    return;
  }
  const [deleted] = await db
    .delete(marketObservationsTable)
    .where(
      and(
        eq(marketObservationsTable.id, params.data.id),
        eq(marketObservationsTable.userId, currentUserId(req)),
      ),
    )
    .returning({ id: marketObservationsTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Market observation not found." });
    return;
  }
  res.sendStatus(204);
});

export default router;