import { Router } from "express";
import { SaleController } from "../controller/sale.controller";

const router = Router();

// POST /api/v1/sales - Create a new sale
router.post("/", SaleController.createSale);

// GET /api/v1/sales - Get all sales with pagination and filtering
router.get("/", SaleController.getSales);

// GET /api/v1/sales/getDailyReportData - Get daily report data
router.get("/getDailyReportData", SaleController.getDailyReportData);
// GET /api/v1/sales/getMoneyReport - Get money report for a specific day and outlet
router.get("/getMoneyReport", SaleController.getMoneyReport);
router.get("/getSummeryReport", SaleController.getSummeryReport);

// POST /api/v1/sales/payments/:id/cancel - Cancel a payment and revert related sales
router.post("/payments/:id/cancel", SaleController.cancelPayment);

// POST /api/v1/sales/cash-sending - Record cash sending entry
router.post("/cash-sending", SaleController.createCashSending);

// GET /api/v1/sales/cash-sending - List cash sending entries with pagination and filters
router.get("/cash-sending", SaleController.getCashSendingList);

// GET /api/v1/sales/cash-sending/:id - Get a specific cash sending entry by ID
router.get("/cash-sending/:id", SaleController.getCashSendingById);

// PUT /api/v1/sales/cash-sending/:id - Update a specific cash sending entry by ID
router.put("/cash-sending/:id", SaleController.updateCashSending);

// GET /api/v1/sales/:id - Get sale by ID
router.get("/:id", SaleController.getSaleById);

export default router;
