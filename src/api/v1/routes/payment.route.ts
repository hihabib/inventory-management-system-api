import { Router } from "express";
import { PaymentController } from "../controller/payment.controller";

const router = Router();

// GET /api/v1/payments - Get all payments with sale data
router.get("/",  PaymentController.getPayments);

export default router; 