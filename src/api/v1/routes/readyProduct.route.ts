import { Router } from "express";
import { ReadyProductController } from "../controller/readyProduct.controller";

const router = Router();

router.post("/", ReadyProductController.createOrUpdateReadyProducts);
router.put("/", ReadyProductController.updateReadyProducts);
router.delete("/", ReadyProductController.deleteReadyProducts);
router.get("/", ReadyProductController.getReadyProducts);
router.get("/:id", ReadyProductController.getReadyProductById);

export default router;

