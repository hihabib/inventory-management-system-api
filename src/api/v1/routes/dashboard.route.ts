import { Router } from "express";
import { DashboardController } from "../controller/dashboard.controller";

const router = Router();

router.get("/", DashboardController.getDashboardData);

export default router;