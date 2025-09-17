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

        // Validate each product
        for (const product of saleData.products) {
            if (!product.productId || !product.productName || !product.unit || 
                product.quantity === undefined || product.price === undefined) {
                return sendResponse(res, 400, "Each product must have productId, productName, unit, quantity, and price");
            }
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