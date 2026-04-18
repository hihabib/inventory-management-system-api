import { Router } from "express";
import { ProductionHouseStockController } from "../controller/productionHouseStock.controller";

const router = Router();

/**
 * Production House Stock Routes
 * All routes require JWT authentication
 *
 * New routes using renamed tables and fields:
 * - production_house_stock (was ready_product)
 * - stock_allocation_audit (was ready_product_allocation)
 * - stock_config (was ready_product_config)
 */

router.post("/reset", ProductionHouseStockController.resetStock);
router.get("/config", ProductionHouseStockController.getConfig);
router.put("/config", ProductionHouseStockController.updateConfig);
router.post("/", ProductionHouseStockController.createOrUpdateStock);
router.put("/", ProductionHouseStockController.updateStock);
router.delete("/", ProductionHouseStockController.deleteStock);
router.get("/", ProductionHouseStockController.getStock);
router.get("/pending-shipments", ProductionHouseStockController.getPendingShipments);
router.get("/product/:productId/details", ProductionHouseStockController.getStockDetails);
router.get("/:id", ProductionHouseStockController.getStockById);
router.get("/:id/edit-history", ProductionHouseStockController.getStockEditHistory);
router.delete("/:id", ProductionHouseStockController.deleteOneStock);
router.get("/:id/allocations", ProductionHouseStockController.getAllocations);

export default router;
