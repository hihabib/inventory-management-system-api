import { Response } from "express";
import { NewDeliveryHistory } from "../drizzle/schema/deliveryHistory";
import { AuthRequest } from "../middleware/auth";
import { DeliveryHistoryService } from "../service/deliveryHistory.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class DeliveryHistoryController {
    static createDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const deliveryHistoryData = req.body as NewDeliveryHistory[];
        
        // Add createdBy to each item from authenticated user
        const dataWithCreatedBy = deliveryHistoryData.map(item => ({
            ...item,
            createdBy: req.user.id,
            status: item.status || "Order-Shipped" // Default status if not provided
        }));
        
        const createdDeliveryHistories = await DeliveryHistoryService.createDeliveryHistory(dataWithCreatedBy);
        sendResponse(res, 201, 'Delivery histories created successfully', createdDeliveryHistories);
    })

    static updateDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deliveryHistoryData = req.body as Partial<NewDeliveryHistory>;
        const updatedDeliveryHistory = await DeliveryHistoryService.updateDeliveryHistory(id, deliveryHistoryData);
        sendResponse(res, 200, 'Delivery history updated successfully', updatedDeliveryHistory);
    })

    static bulkUpdateDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const deliveryHistoryData = req.body as Array<{ id: string } & Partial<NewDeliveryHistory>>;
        const updatedDeliveryHistories = await DeliveryHistoryService.bulkUpdateDeliveryHistory(deliveryHistoryData);
        sendResponse(res, 200, 'Delivery histories updated successfully', updatedDeliveryHistories);
    })

    static deleteDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedDeliveryHistory = await DeliveryHistoryService.deleteDeliveryHistory(id);
        sendResponse(res, 200, 'Delivery history deleted successfully', deletedDeliveryHistory);
    })

    static getDeliveryHistories = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const deliveryHistories = await DeliveryHistoryService.getDeliveryHistories(pagination, filter);
        sendResponse(res, 200, 'Delivery histories fetched successfully', deliveryHistories);
    })

    static getDeliveryHistoryById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deliveryHistory = await DeliveryHistoryService.getDeliveryHistoryById(id);
        if (!deliveryHistory) {
            return sendResponse(res, 404, 'Delivery history not found', null);
        }
        sendResponse(res, 200, 'Delivery history fetched successfully', deliveryHistory);
    })
}