import { Router } from "express";
import { DeliveryHistoryController } from "../controller/deliveryHistory.controller";

const router = Router();

router
    .post("/", DeliveryHistoryController.createDeliveryHistory)
    .get("/", DeliveryHistoryController.getDeliveryHistories)
    .get("/:id", DeliveryHistoryController.getDeliveryHistoryById)
    .put("/", DeliveryHistoryController.bulkUpdateDeliveryHistory)
    .put("/:id", DeliveryHistoryController.updateDeliveryHistory)
    .patch("/:id", DeliveryHistoryController.updateDeliveryHistory)
    .delete("/:id", DeliveryHistoryController.deleteDeliveryHistory);

export default router;