import { Response } from "express";
import { eq } from "drizzle-orm";
import { AuthRequest } from "../middleware/auth";
import { SaleService } from "../service/sale.service";
import { PaymentService } from "../service/payment.service";
import { ExpenseService } from "../service/expense.service";
import { CustomerDueService } from "../service/customerDue.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { db } from "../drizzle/db";
import { maintainsTable } from "../drizzle/schema/maintains";
import { getCurrentDate } from "../utils/timezone";

export class SaleController {
    static createSale = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user?.id;
        if (!userId) {
            return sendResponse(res, 401, "User not authenticated");
        }

        const saleData = req.body;
        
        // Validate required fields
        if (!saleData.maintainsId || !saleData.products || !Array.isArray(saleData.products) || saleData.products.length === 0) {
            return sendResponse(res, 400, "Invalid sale data. maintainsId and products array are required");
        }

        if (!saleData.paymentInfo || !Array.isArray(saleData.paymentInfo) || saleData.paymentInfo.length === 0) {
            return sendResponse(res, 400, "Payment information is required");
        }

        // Validate each product for multi-batch sale requirements
        for (let i = 0; i < saleData.products.length; i++) {
            const product = saleData.products[i];
            
            if (!product.productId || !product.productName || !product.unit || 
                product.quantity === undefined || product.price_per_quantity === undefined) {
                return sendResponse(res, 400, `Product ${i + 1}: productId, productName, unit, quantity, and price_per_quantity are required`);
            }

            // Validate multi-batch sale specific fields
            if (!product.stockBatchId || typeof product.stockBatchId !== 'string') {
                return sendResponse(res, 400, `Product ${i + 1}: stockBatchId is required and must be a string`);
            }

            if (!product.unitId || typeof product.unitId !== 'string') {
                return sendResponse(res, 400, `Product ${i + 1}: unitId is required and must be a string`);
            }

            if (typeof product.quantity !== 'number' || product.quantity <= 0) {
                return sendResponse(res, 400, `Product ${i + 1}: quantity must be a positive number`);
            }

            if (typeof product.price_per_quantity !== 'number' || product.price_per_quantity < 0) {
                return sendResponse(res, 400, `Product ${i + 1}: price_per_quantity must be a non-negative number`);
            }

            // Validate discount fields
            if (product.discount !== undefined && (typeof product.discount !== 'number' || product.discount < 0)) {
                return sendResponse(res, 400, `Product ${i + 1}: discount must be a non-negative number`);
            }

            if (product.discountType && !['Fixed', 'Percentage'].includes(product.discountType)) {
                return sendResponse(res, 400, `Product ${i + 1}: discountType must be either 'Fixed' or 'Percentage'`);
            }

            // Validate percentage discount range
            if (product.discountType === 'Percentage' && product.discount !== undefined && product.discount > 100) {
                return sendResponse(res, 400, `Product ${i + 1}: percentage discount cannot exceed 100%`);
            }
        }

        // Validate payment information
        let totalPaymentAmount = 0;
        const validPaymentMethods = ["bkash", "nogod", "cash", "due", "card", "sendForUse"];
        
        for (let i = 0; i < saleData.paymentInfo.length; i++) {
            const payment = saleData.paymentInfo[i];
            
            if (!payment.method || typeof payment.method !== 'string') {
                return sendResponse(res, 400, `Payment ${i + 1}: method is required and must be a string`);
            }

            if (!validPaymentMethods.includes(payment.method)) {
                return sendResponse(res, 400, `Payment ${i + 1}: invalid payment method '${payment.method}'. Valid methods: ${validPaymentMethods.join(', ')}`);
            }

            if (typeof payment.amount !== 'number' || payment.amount < 0) {
                return sendResponse(res, 400, `Payment ${i + 1}: amount must be a non-negative number`);
            }

            totalPaymentAmount += payment.amount;
        }

        // Validate payment total matches sale total
        if (Math.abs(totalPaymentAmount - saleData.totalPriceWithDiscount) > 0.01) {
            return sendResponse(res, 400, `Total payment amount (${totalPaymentAmount}) does not match sale total (${saleData.totalPriceWithDiscount})`);
        }

        // Check if due payment requires customer ID
        const duePayment = saleData.paymentInfo.find((p: any) => p.method === 'due' && p.amount > 0);
        if (duePayment && !saleData.customerId) {
            return sendResponse(res, 400, "Customer ID is required when due amount is greater than 0");
        }

        // Validate total amounts
        if (typeof saleData.totalPriceWithDiscount !== 'number' || saleData.totalPriceWithDiscount < 0) {
            return sendResponse(res, 400, "totalPriceWithDiscount must be a non-negative number");
        }

        try {
            const result = await SaleService.createSale(saleData, userId);
            return sendResponse(res, 201, "Sale created successfully", result);
        } catch (error) {
            console.error("Error creating sale:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to create sale");
        }
    });

    static cancelPayment = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user?.id;
        if (!userId) return sendResponse(res, 401, "User not authenticated");

        const { id } = req.params;
        const paymentId = Number(id);
        if (!id || !Number.isInteger(paymentId) || paymentId <= 0) {
            return sendResponse(res, 400, "Invalid or missing payment id (must be a positive integer)");
        }

        try {
            const result = await SaleService.cancelPayment(paymentId);
            return sendResponse(res, 200, "Payment canceled successfully", result);
        } catch (error) {
            console.error("Error canceling payment:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to cancel payment");
        }
    });

    static getSales = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        
        try {
            const sales = await SaleService.getSales(pagination, filter);
            return sendResponse(res, 200, "Sales retrieved successfully", sales);
        } catch (error) {
            console.error("Error retrieving sales:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to retrieve sales");
        }
    });

    static getSaleById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        
        if (!id) {
            return sendResponse(res, 400, "Sale ID is required");
        }

        try {
            const sale = await SaleService.getSaleById(id);
            
            if (!sale) {
                return sendResponse(res, 404, "Sale not found");
            }

            return sendResponse(res, 200, "Sale retrieved successfully", sale);
        } catch (error) {
            console.error("Error retrieving sale:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to retrieve sale");
        }
    });

    static getDailyReportData = requestHandler(async (req: AuthRequest, res: Response) => {
        const { startDate, endDate, maintains_id, isDummy, reduceSalePercentage } = req.query;
        
        if (!startDate || !endDate || !maintains_id) {
            return sendResponse(res, 400, "Parameters 'startDate', 'endDate' and 'maintains_id' are required");
        }

        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
        if (!isoRegex.test(startDate as string) || !isoRegex.test(endDate as string)) {
            return sendResponse(res, 400, "Invalid date format. Use ISO UTC (e.g., 2025-10-26T18:00:00.000Z)");
        }

        // Validate maintains_id format (should be UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(maintains_id as string)) {
            return sendResponse(res, 400, "Invalid maintains_id format. Must be a valid UUID");
        }

        // Validate isDummy parameter
        if (isDummy && isDummy !== "true" && isDummy !== "false") {
            return sendResponse(res, 400, "Invalid isDummy value. Must be 'true' or 'false'");
        }

        // Validate reduceSalePercentage when isDummy is true
        if (isDummy === "true") {
            if (!reduceSalePercentage) {
                return sendResponse(res, 400, "reduceSalePercentage is required when isDummy is 'true'");
            }

            const percentage = parseFloat(reduceSalePercentage as string);
            if (isNaN(percentage) || percentage < 1 || percentage > 100) {
                return sendResponse(res, 400, "reduceSalePercentage must be a number between 1 and 100");
            }
        }

        try {
            const reportData = await SaleService.getDailyReportData(
                startDate as string,
                endDate as string,
                maintains_id as string,
                isDummy === "true",
                reduceSalePercentage ? parseFloat(reduceSalePercentage as string) : undefined
            );
            return sendResponse(res, 200, "Daily report data retrieved successfully", reportData);
        } catch (error) {
            console.error("Error retrieving daily report data:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to retrieve daily report data");
        }
    });

    // GET /api/v1/sales/getMoneyReport
    // Query params: maintains_id (UUID), startDate (ISO), endDate (ISO)
    static getMoneyReport = requestHandler(async (req: AuthRequest, res: Response) => {
        const { maintains_id, startDate, endDate } = req.query;

        if (!maintains_id || !startDate || !endDate) {
            return sendResponse(res, 400, "Parameters 'maintains_id', 'startDate' and 'endDate' are required");
        }

        // Validate maintains_id format (UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(maintains_id as string)) {
            return sendResponse(res, 400, "Invalid maintains_id format. Must be a valid UUID");
        }

        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return sendResponse(res, 400, "Invalid date format for 'startDate' or 'endDate'");
        }

        try {
            const maintainsId = maintains_id as string;
            const data = await SaleService.getMoneyReport(start, end, maintainsId);
            return sendResponse(res, 200, "Money report generated successfully", data);
        } catch (error) {
            console.error("Error generating money report:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to generate money report");
        }
    });

    static createCashSending = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user?.id;
        if (!userId) return sendResponse(res, 401, "User not authenticated");

        const { maintainsId, cashAmount, cashOf, note, cashSendingBy } = req.body ?? {};

        // Validate maintainsId (UUID)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!maintainsId || typeof maintainsId !== 'string' || !uuidRegex.test(maintainsId)) {
            return sendResponse(res, 400, "Invalid or missing maintainsId (must be UUID)");
        }

        // Validate cashAmount
        if (typeof cashAmount !== 'number' || !isFinite(cashAmount) || cashAmount <= 0) {
            return sendResponse(res, 400, "cashAmount must be a positive number");
        }

        // Validate cashOf (ISO string, UTC expected)
        if (!cashOf || typeof cashOf !== 'string') {
            return sendResponse(res, 400, "cashOf is required and must be an ISO string");
        }
        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
        if (!isoRegex.test(cashOf)) {
            return sendResponse(res, 400, "cashOf must be an ISO string in UTC (e.g., 2025-10-26T18:00:00.000Z)");
        }

        if (note !== undefined && typeof note !== 'string') {
            return sendResponse(res, 400, "note must be a string when provided");
        }

        if (cashSendingBy !== undefined && typeof cashSendingBy !== 'string') {
            return sendResponse(res, 400, "cashSendingBy must be a string when provided");
        }

        try {
            const created = await SaleService.createCashSending({ maintainsId, cashAmount, cashOf, note, cashSendingBy }, userId);
            return sendResponse(res, 201, "Cash sending recorded successfully", created);
        } catch (error) {
            console.error("Error creating cash sending:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to record cash sending");
        }
    });

    static getCashSendingList = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const sortParam = (req.query.sort as string)?.toLowerCase();
        const sort: 'asc' | 'desc' = sortParam === 'asc' ? 'asc' : 'desc';

        try {
            const list = await SaleService.getCashSendingList(pagination, filter, sort);
            return sendResponse(res, 200, "Cash sending list retrieved successfully", list);
        } catch (error) {
            console.error("Error retrieving cash sending list:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to retrieve cash sending list");
        }
    });

    static getCashSendingById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const idNum = Number(id);
        if (!id || !Number.isInteger(idNum) || idNum <= 0) {
            return sendResponse(res, 400, "Invalid or missing cash-sending id (must be a positive integer)");
        }

        try {
            const data = await SaleService.getCashSendingById(idNum);
            if (!data) {
                return sendResponse(res, 404, "Cash sending not found");
            }
            return sendResponse(res, 200, "Cash sending retrieved successfully", data);
        } catch (error) {
            console.error("Error retrieving cash sending by id:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to retrieve cash sending");
        }
    });

    static updateCashSending = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user?.id;
        if (!userId) return sendResponse(res, 401, "User not authenticated");

        const { id } = req.params;
        const idNum = Number(id);
        if (!id || !Number.isInteger(idNum) || idNum <= 0) {
            return sendResponse(res, 400, "Invalid or missing cash-sending id (must be a positive integer)");
        }

        const { maintainsId, cashAmount, cashOf, note, cashSendingBy } = req.body ?? {};

        // Validate maintainsId (UUID) when provided
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (maintainsId !== undefined) {
            if (typeof maintainsId !== 'string' || !uuidRegex.test(maintainsId)) {
                return sendResponse(res, 400, "Invalid maintainsId (must be UUID)");
            }
        }

        if (cashAmount !== undefined) {
            if (typeof cashAmount !== 'number' || !isFinite(cashAmount) || cashAmount <= 0) {
                return sendResponse(res, 400, "cashAmount must be a positive number when provided");
            }
        }

        if (cashOf !== undefined) {
            if (typeof cashOf !== 'string') {
                return sendResponse(res, 400, "cashOf must be an ISO string when provided");
            }
            const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
            if (!isoRegex.test(cashOf)) {
                return sendResponse(res, 400, "cashOf must be an ISO string in UTC (e.g., 2025-10-26T18:00:00.000Z)");
            }
        }

        if (note !== undefined && typeof note !== 'string') {
            return sendResponse(res, 400, "note must be a string when provided");
        }

        if (cashSendingBy !== undefined && typeof cashSendingBy !== 'string') {
            return sendResponse(res, 400, "cashSendingBy must be a string when provided");
        }

        try {
            // Ensure record exists first
            const existing = await SaleService.getCashSendingById(idNum);
            if (!existing) return sendResponse(res, 404, "Cash sending not found");

            const updated = await SaleService.updateCashSending(idNum, { maintainsId, cashAmount, cashOf, note, cashSendingBy });
            if (!updated) return sendResponse(res, 404, "Cash sending not found");
            return sendResponse(res, 200, "Cash sending updated successfully", updated);
        } catch (error) {
            console.error("Error updating cash sending:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to update cash sending");
        }
    });

    static getSummeryReport = requestHandler(async (req: AuthRequest, res: Response) => {
        const { from, to, maintains_id } = req.query;

        if (!from || !to || !maintains_id) {
            return sendResponse(res, 400, "Parameters 'from', 'to' and 'maintains_id' are required");
        }

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(maintains_id as string)) {
            return sendResponse(res, 400, "Invalid maintains_id format. Must be a valid UUID");
        }

        const fromDate = new Date(from as string);
        const toDate = new Date(to as string);
        if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
            return sendResponse(res, 400, "Invalid date format for 'from' or 'to'");
        }

        try {
            const data = await SaleService.getSummeryReport(from as string, to as string, maintains_id as string);
            return sendResponse(res, 200, "Summery report generated successfully", data);
        } catch (error) {
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to generate summery report");
        }
    });
}
