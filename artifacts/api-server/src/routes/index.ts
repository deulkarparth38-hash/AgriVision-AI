import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import farmRouter from "./farm";
import advisoriesRouter from "./advisories";
import diagnosesRouter from "./diagnoses";
import climateRouter from "./climate";
import marketRouter from "./market";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(farmRouter);
router.use(advisoriesRouter);
router.use(diagnosesRouter);
router.use(climateRouter);
router.use(marketRouter);
router.use(chatRouter);

export default router;
