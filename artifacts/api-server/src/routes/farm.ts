import { Router, type IRouter } from "express";
import { count, desc, eq } from "drizzle-orm";
import {
  GetDashboardSummaryResponse,
  GetProfileResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";
import {
  advisoriesTable,
  conversationsTable,
  db,
  diagnosesTable,
  farmProfilesTable,
  marketObservationsTable,
} from "@workspace/db";
import { currentUserId, requireAuth } from "../middlewares/require-auth";
import { ListAdvisoriesResponse, ListDiagnosesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

function profileResponse(profile: typeof farmProfilesTable.$inferSelect | undefined) {
  return GetProfileResponse.parse(
    profile ?? {
      farmName: "",
      region: "",
      country: "",
      crops: [],
      areaHa: null,
      latitude: null,
      longitude: null,
      soilType: null,
      soilPH: null,
      nitrogen: null,
      phosphorus: null,
      potassium: null,
      organicCarbonPct: null,
      irrigation: null,
      budgetPerHa: null,
      currency: "USD",
    },
  );
}

router.get("/profile", requireAuth, async (req, res): Promise<void> => {
  const [profile] = await db
    .select()
    .from(farmProfilesTable)
    .where(eq(farmProfilesTable.userId, currentUserId(req)))
    .limit(1);
  res.json(profileResponse(profile));
});

router.patch("/profile", requireAuth, async (req, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the farm profile fields and try again." });
    return;
  }
  const userId = currentUserId(req);
  const [profile] = await db
    .insert(farmProfilesTable)
    .values({ userId, ...parsed.data })
    .onConflictDoUpdate({
      target: farmProfilesTable.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();
  res.json(UpdateProfileResponse.parse(profile));
});

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const userId = currentUserId(req);
  const [advisoryCount, diagnosisCount, conversationCount, observationCount] = await Promise.all([
    db.select({ value: count() }).from(advisoriesTable).where(eq(advisoriesTable.userId, userId)),
    db.select({ value: count() }).from(diagnosesTable).where(eq(diagnosesTable.userId, userId)),
    db.select({ value: count() }).from(conversationsTable).where(eq(conversationsTable.userId, userId)),
    db.select({ value: count() }).from(marketObservationsTable).where(eq(marketObservationsTable.userId, userId)),
  ]);
  const [advisories, diagnoses] = await Promise.all([
    db.select().from(advisoriesTable).where(eq(advisoriesTable.userId, userId)).orderBy(desc(advisoriesTable.createdAt)).limit(3),
    db.select().from(diagnosesTable).where(eq(diagnosesTable.userId, userId)).orderBy(desc(diagnosesTable.createdAt)).limit(3),
  ]);
  const recentAdvisories = ListAdvisoriesResponse.parse(
    advisories.map((item) => ({
      id: item.id,
      crop: item.crop,
      region: item.region,
      season: item.season,
      createdAt: item.createdAt.toISOString(),
      report: item.report,
    })),
  );
  const recentDiagnoses = ListDiagnosesResponse.parse(
    diagnoses.map((item) => ({
      id: item.id,
      crop: item.crop,
      region: item.region,
      createdAt: item.createdAt.toISOString(),
      report: item.report,
    })),
  );
  res.json(
    GetDashboardSummaryResponse.parse({
      advisoryCount: Number(advisoryCount[0]?.value ?? 0),
      diagnosisCount: Number(diagnosisCount[0]?.value ?? 0),
      conversationCount: Number(conversationCount[0]?.value ?? 0),
      observationCount: Number(observationCount[0]?.value ?? 0),
      recentAdvisories,
      recentDiagnoses,
    }),
  );
});

export default router;