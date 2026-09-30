import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import type { ErrorRequestHandler } from "express";
import router from "./routes";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";

const app: Express = express();
const PgSessionStore = connectPgSimple(session);

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be configured before the API server starts.");
}

app.set("trust proxy", 1);
app.use(helmet());

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "8mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    name: "agrivision.sid",
    store: new PgSessionStore({
      pool,
      tableName: "session",
      createTableIfMissing: false,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use("/api", router);

const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  const errorName =
    typeof error === "object" && error !== null && "name" in error
      ? String(error.name)
      : "UnknownError";
  req.log.error({ errorName }, "Request failed");
  res.status(500).json({ error: "We couldn't complete that request. Please try again." });
};
app.use(errorHandler);

export default app;
