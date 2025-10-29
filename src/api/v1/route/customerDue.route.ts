import { Router } from "express";
import { CustomerDueController } from "../controller/customerDue.controller";
import { authMiddleware } from "../middleware/auth";

const router = Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// GET /customer-due - Fetch Customer Due List with pagination and filtering
router.get("/", CustomerDueController.getCustomerDues);

// GET /customer-due/:id - Get a specific customer due record by ID
router.get("/:id", CustomerDueController.getCustomerDueById);

// POST /customer-due - Create a new customer due record
router.post("/", CustomerDueController.createCustomerDue);

// PUT /customer-due/:id - Update an existing customer due record
router.put("/:id", CustomerDueController.updateCustomerDue);

// DELETE /customer-due/:id - Delete a customer due record
router.delete("/:id", CustomerDueController.deleteCustomerDue);

export default router;