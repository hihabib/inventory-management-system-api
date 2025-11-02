import { Router } from "express";
import { ExpenseController } from "../controller/expense.controller";

const router = Router();

// CRUD operations
router.post("/", ExpenseController.createExpense);
router.get("/", ExpenseController.getExpenses);
router.get("/:id", ExpenseController.getExpenseById);
router.put("/:id", ExpenseController.updateExpense);
router.delete("/:id", ExpenseController.deleteExpense);

export default router;