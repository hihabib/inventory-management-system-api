import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { SaleService } from "../service/sale.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

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

            if (typeof product.price_per_quantity !== 'number' || product.price_per_quantity <= 0) {
                return sendResponse(res, 400, `Product ${i + 1}: price_per_quantity must be a positive number`);
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
        if (typeof saleData.totalPriceWithDiscount !== 'number' || saleData.totalPriceWithDiscount <= 0) {
            return sendResponse(res, 400, "totalPriceWithDiscount must be a positive number");
        }

        try {
            const result = await SaleService.createSale(saleData, userId);
            return sendResponse(res, 201, "Sale created successfully", result);
        } catch (error) {
            console.error("Error creating sale:", error);
            return sendResponse(res, 500, error instanceof Error ? error.message : "Failed to create sale");
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
}