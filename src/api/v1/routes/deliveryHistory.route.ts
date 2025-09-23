import { Router } from "express";
import { DeliveryHistoryController } from "../controller/deliveryHistory.controller";

const router = Router();

// CRUD operations
router.post("/", DeliveryHistoryController.createDeliveryHistory);
router.get("/", DeliveryHistoryController.getDeliveryHistories);
router.get("/:id", DeliveryHistoryController.getDeliveryHistoryById);
router.put("/", DeliveryHistoryController.bulkUpdateDeliveryHistory);
router.put("/:id", DeliveryHistoryController.updateDeliveryHistory);
router.delete("/:id", DeliveryHistoryController.deleteDeliveryHistory);

export default router;