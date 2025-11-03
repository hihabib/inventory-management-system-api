import { Response } from "express";
import { NewExpense } from "../drizzle/schema/expense";
import { AuthRequest } from "../middleware/auth";
import { ExpenseService } from "../service/expense.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class ExpenseController {
    static createExpense = requestHandler(async (req: AuthRequest, res: Response) => {
        const expenseData = req.body as NewExpense;
        const userId = req.user.id;
        expenseData.userId = userId;
        if (!expenseData.date) {
            expenseData.date = new Date();
        } else if (typeof expenseData.date === 'string') {
            expenseData.date = new Date(expenseData.date);
        }
        // Validate required fields
        if (!expenseData.userId || !expenseData.amount || !expenseData.description || !expenseData.date) {
            return sendResponse(res, 400, 'User ID, amount, description, and date are required', null);
        }

        // Validate amount is a positive number
        if (isNaN(Number(expenseData.amount)) || Number(expenseData.amount) <= 0) {
            return sendResponse(res, 400, 'Amount must be a positive number', null);
        }

        // Validate date format
        const dateValue = new Date(expenseData.date);
        if (isNaN(dateValue.getTime())) {
            return sendResponse(res, 400, 'Invalid date format', null);
        }

        const createdExpense = await ExpenseService.createExpense(expenseData);
        sendResponse(res, 201, 'Expense created successfully', createdExpense);
    });

    static getExpenses = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
    
        const expenses = await ExpenseService.getExpenses(pagination, filter);
        sendResponse(res, 200, 'Expenses fetched successfully', expenses);
    });

    static getExpenseById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const expense = await ExpenseService.getExpenseById(id);
        if (!expense) {
            return sendResponse(res, 404, 'Expense not found', null);
        }
        sendResponse(res, 200, 'Expense fetched successfully', expense);
    });

    static updateExpense = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const expenseData = req.body as Partial<NewExpense>;

        // Validate amount if provided
        if (expenseData.amount !== undefined) {
            if (isNaN(Number(expenseData.amount)) || Number(expenseData.amount) <= 0) {
                return sendResponse(res, 400, 'Amount must be a positive number', null);
            }
        }

        // Validate date format if provided
        if (expenseData.date !== undefined) {
            const dateValue = new Date(expenseData.date);
            if (isNaN(dateValue.getTime())) {
                return sendResponse(res, 400, 'Invalid date format', null);
            }
        }

        try {
            const updatedExpense = await ExpenseService.updateExpense(id, expenseData);
            sendResponse(res, 200, 'Expense updated successfully', updatedExpense);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                return sendResponse(res, 404, error.message, null);
            }
            throw error;
        }
    });

    static deleteExpense = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        try {
            const deletedExpense = await ExpenseService.deleteExpense(id);
            sendResponse(res, 200, 'Expense deleted successfully', deletedExpense);
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                return sendResponse(res, 404, error.message, null);
            }
            throw error;
        }
    });
}