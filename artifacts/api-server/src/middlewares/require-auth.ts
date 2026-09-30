import type { NextFunction, Request, Response } from "express";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Sign in to access this information." });
    return;
  }
  next();
}

export function currentUserId(req: Request): string {
  const userId = req.session.userId;
  if (!userId) {
    throw new Error("Authenticated request is missing its user id.");
  }
  return userId;
}