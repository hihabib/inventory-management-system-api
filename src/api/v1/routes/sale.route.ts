import { Router } from "express";
import { SaleController } from "../controller/sale.controller";

const router = Router();

// POST /api/v1/sales - Create a new sale
router.post("/", SaleController.createSale);

// GET /api/v1/sales - Get all sales with pagination and filtering
router.get("/", SaleController.getSales);

// GET /api/v1/sales/:id - Get sale by ID
router.get("/:id", SaleController.getSaleById);

export default router;