import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { SaleService } from '../service/sale.service';

export class SaleController {
    // Create a new sale record
    static createSale = requestHandler(async (req: AuthRequest, res: Response) => {
        const {
            products,
            totalQuantity,
            totalPriceWithoutDiscount,
            totalDiscount,
            totalPriceWithDiscount,
            paymentInfo,
            customerCategoryId,
            customerId
        } = req.body;

        // Validate required fields
        if (!products || !Array.isArray(products) || products.length === 0) {
            return sendResponse(res, 400, 'Products are required');
        }

        if (totalQuantity === undefined || totalPriceWithoutDiscount === undefined || totalDiscount === undefined || totalPriceWithDiscount === undefined) {
            return sendResponse(res, 400, 'Missing required total fields');
        }

        if (!paymentInfo || !Array.isArray(paymentInfo) || paymentInfo.length === 0) {
            return sendResponse(res, 400, 'Payment information is required');
        }

        if (!customerCategoryId) {
            return sendResponse(res, 400, 'Customer category is required');
        }

        // Get user ID from the authenticated user
        const userId = req.user?.id;
        if (!userId) {
            return sendResponse(res, 401, 'User not authenticated');
        }

        // Create the sold record
        const soldRecord = await SaleService.createSoldRecord(
            {
                userId,
                customerCategoryId,
                customerId: customerId || null, // If customerId is not provided, it will be null
                totalQuantity,
                totalPriceWithoutDiscount,
                totalDiscount,
                totalPriceWithDiscount
            },
            products.map((product: any) => ({
                productName: product.productName,
                discount: product.discount,
                discountType: product.discountType,
                price: product.price,
                quantity: product.quantity,
                stock: product.stock
            })),
            paymentInfo.map((payment: any) => ({
                method: payment.method,
                amount: payment.amount
            }))
        );

        sendResponse(res, 201, 'Sale recorded successfully', soldRecord);
    });

    // Get a sale record by ID
    static getSale = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const saleData = await SaleService.getSoldRecordById(id);

        if (!saleData) {
            return sendResponse(res, 404, 'Sale record not found');
        }

        // Check if the user is authorized to view this record
        if (req.user?.role !== 'admin' && saleData.soldRecord.userId !== req.user?.id) {
            return sendResponse(res, 403, 'Unauthorized to access this sale record');
        }

        sendResponse(res, 200, 'Sale record retrieved successfully', saleData);
    });

    // Get all sale records for the authenticated user
    static getUserSales = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user?.id;
        if (!userId) {
            return sendResponse(res, 401, 'User not authenticated');
        }

        const sales = await SaleService.getSoldRecordsByUser(userId);

        sendResponse(res, 200, 'Sales retrieved successfully', sales);
    });

    // Delete a sale record
    static deleteSale = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        // First, get the record to check ownership
        const saleData = await SaleService.getSoldRecordById(id);

        if (!saleData) {
            return sendResponse(res, 404, 'Sale record not found');
        }

        // Check if the user is authorized to delete this record
        if (req.user?.role !== 'admin' && saleData.soldRecord.userId !== req.user?.id) {
            return sendResponse(res, 403, 'Unauthorized to delete this sale record');
        }

        await SaleService.deleteSoldRecord(id);

        sendResponse(res, 200, 'Sale record deleted successfully');
    });
}