import { Router } from "express";
import { MaintainsController } from "../controller/maintains.controller";

const router = Router();

// CRUD operations
router.post("/", MaintainsController.createMaintains);
router.get("/", MaintainsController.getMaintains);
router.get("/:id", MaintainsController.getMaintainsById);
router.put("/:id", MaintainsController.updateMaintains);
router.delete("/:id", MaintainsController.deleteMaintains);

export default router;