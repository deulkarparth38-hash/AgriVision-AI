import { Router, type IRouter, type Request } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  GetSessionResponse,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  RegisterBody,
  RegisterResponse,
} from "@workspace/api-zod";
import { db, farmProfilesTable, usersTable } from "@workspace/db";
import { authLimiter } from "../lib/limits";

const router: IRouter = Router();
const SALT_ROUNDS = 12;

function sessionUser(user: typeof usersTable.$inferSelect) {
  return {
    authenticated: true,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

function regenerateSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function saveSession(req: Request) {
  return new Promise<void>((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

router.get("/auth/session", async (req, res): Promise<void> => {
  const userId = req.session.userId;
  if (!userId) {
    res.json(GetSessionResponse.parse({ authenticated: false, user: null }));
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    req.session.destroy(() => undefined);
    res.json(GetSessionResponse.parse({ authenticated: false, user: null }));
    return;
  }
  res.json(GetSessionResponse.parse(sessionUser(user)));
});

router.post("/auth/register", authLimiter, async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Check the account details and try again." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists." });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.password, SALT_ROUNDS);
  const user = {
    id: randomUUID(),
    name: parsed.data.name.trim(),
    email,
    passwordHash,
    role: parsed.data.role,
  };
  try {
    const [created] = await db.insert(usersTable).values(user).returning();
    await db.insert(farmProfilesTable).values({ userId: created.id }).onConflictDoNothing();
    await regenerateSession(req);
    req.session.userId = created.id;
    await saveSession(req);
    res.status(201).json(RegisterResponse.parse(sessionUser(created)));
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    throw error;
  }
});

router.post("/auth/login", authLimiter, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    res.status(401).json({ error: "The email or password is incorrect." });
    return;
  }
  await regenerateSession(req);
  req.session.userId = user.id;
  await saveSession(req);
  res.json(LoginResponse.parse(sessionUser(user)));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
  res.clearCookie("agrivision.sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });
  res.json(LogoutResponse.parse({ success: true }));
});

export default router;