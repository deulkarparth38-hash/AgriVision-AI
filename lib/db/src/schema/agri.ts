import { createInsertSchema } from "drizzle-zod";
import {
  doublePrecision,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

export const usersTable = pgTable(
  "agri_users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 32 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("agri_users_email_unique").on(table.email)],
);

export const farmProfilesTable = pgTable("farm_profiles", {
  userId: varchar("user_id", { length: 36 })
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  farmName: varchar("farm_name", { length: 120 }).notNull().default(""),
  region: varchar("region", { length: 120 }).notNull().default(""),
  country: varchar("country", { length: 120 }).notNull().default(""),
  crops: jsonb("crops").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  areaHa: doublePrecision("area_ha"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  soilType: varchar("soil_type", { length: 100 }),
  soilPH: doublePrecision("soil_ph"),
  nitrogen: doublePrecision("nitrogen"),
  phosphorus: doublePrecision("phosphorus"),
  potassium: doublePrecision("potassium"),
  organicCarbonPct: doublePrecision("organic_carbon_pct"),
  irrigation: varchar("irrigation", { length: 120 }),
  budgetPerHa: doublePrecision("budget_per_ha"),
  currency: varchar("currency", { length: 3 }).notNull().default("USD"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const advisoriesTable = pgTable(
  "advisories",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    crop: varchar("crop", { length: 80 }).notNull(),
    region: varchar("region", { length: 160 }).notNull(),
    season: varchar("season", { length: 80 }).notNull(),
    input: jsonb("input").$type<Record<string, unknown>>().notNull(),
    report: jsonb("report").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("advisories_user_created_idx").on(table.userId, table.createdAt)],
);

export const diagnosesTable = pgTable(
  "diagnoses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    crop: varchar("crop", { length: 80 }),
    region: varchar("region", { length: 160 }),
    report: jsonb("report").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("diagnoses_user_created_idx").on(table.userId, table.createdAt)],
);

export const marketObservationsTable = pgTable(
  "market_observations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    crop: varchar("crop", { length: 80 }).notNull(),
    region: varchar("region", { length: 160 }).notNull(),
    market: varchar("market", { length: 160 }).notNull(),
    unit: varchar("unit", { length: 40 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    price: doublePrecision("price").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    source: varchar("source", { length: 160 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("market_observations_user_crop_date_idx").on(
      table.userId,
      table.crop,
      table.observedAt,
    ),
  ],
);

export const conversationsTable = pgTable(
  "agri_conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agri_conversations_user_updated_idx").on(table.userId, table.updatedAt)],
);

export const messagesTable = pgTable(
  "agri_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 36 })
      .notNull()
      .references(() => conversationsTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 })
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 16 }).notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agri_messages_conversation_created_idx").on(table.conversationId, table.createdAt)],
);

export const sessionsTable = pgTable(
  "session",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: jsonb("sess").$type<Record<string, unknown>>().notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("session_expire_idx").on(table.expire)],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({ createdAt: true });
export const insertFarmProfileSchema = createInsertSchema(farmProfilesTable).omit({
  updatedAt: true,
});
export const insertAdvisorySchema = createInsertSchema(advisoriesTable).omit({
  createdAt: true,
});
export const insertDiagnosisSchema = createInsertSchema(diagnosesTable).omit({
  createdAt: true,
});
export const insertMarketObservationSchema = createInsertSchema(marketObservationsTable).omit({
  createdAt: true,
});
export const insertConversationSchema = createInsertSchema(conversationsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  createdAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type FarmProfile = typeof farmProfilesTable.$inferSelect;
export type AdvisoryRecord = typeof advisoriesTable.$inferSelect;
export type DiagnosisRecord = typeof diagnosesTable.$inferSelect;
export type MarketObservation = typeof marketObservationsTable.$inferSelect;
export type Conversation = typeof conversationsTable.$inferSelect;
export type Message = typeof messagesTable.$inferSelect;