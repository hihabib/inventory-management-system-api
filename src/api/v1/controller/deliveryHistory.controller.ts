import { Response } from "express";
import { NewDeliveryHistory } from "../drizzle/schema/deliveryHistory";
import { AuthRequest } from "../middleware/auth";
import { DeliveryHistoryService } from "../service/deliveryHistory.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class DeliveryHistoryController {
    static createDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const deliveryHistoryData = req.body as Array<NewDeliveryHistory & {
            latestUnitPriceData?: { unitId: string; pricePerQuantity: number }[]
        }>;


        // Add createdBy to each item from authenticated user
        const dataWithCreatedBy: NewDeliveryHistory[] = [];
        for (const item of deliveryHistoryData) {
            // Check if status, unit id, product id, and maintains id are provided
            if (!item.status || !item.unitId || !item.productId || !item.maintainsId) {
                return sendResponse(res, 400, 'Status, unit id, product id, and maintains id are required', null);
            }


            // Check if ordered quantity and ordered unit are provided for Order-Placed status
            if ((item.status === "Order-Placed" && !item.orderedQuantity)
                || (item.status === "Order-Placed" && !item.orderedUnit)) {
                return sendResponse(res, 400, 'Ordered quantity and ordered unit are required for Order-Placed status', null);
            }

            // Check if sent quantity is provided for Order-Shipped status
            if ((item.status === "Order-Shipped" && !item.sentQuantity)) {
                return sendResponse(res, 400, 'Sent quantity is required for Order-Shipped status', null);
            }
            // Check if sent quantity and received quantity are provided for Order-Completed status
            if ((item.status === "Order-Completed" && !item.sentQuantity && !item.receivedQuantity)) {
                return sendResponse(res, 400, 'Sent quantity and received quantity are required for Order-Completed status', null);
            }

            // Check if return quantity is provided for Return-Placed status
            if ((item.status === "Return-Placed" && !item.sentQuantity)) {
                return sendResponse(res, 400, 'Return quantity, and sent date are required for Return-Placed status', null);
            }

            dataWithCreatedBy.push({
                ...item,
                createdBy: req.user.id,
            });
        }
        const createdDeliveryHistories = await DeliveryHistoryService.createDeliveryHistory(dataWithCreatedBy);
        sendResponse(res, 201, 'Transaction created successfully', createdDeliveryHistories);
    })

    static updateDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deliveryHistoryData = req.body as Partial<NewDeliveryHistory & {
            latestUnitPriceData?: { unitId: string; pricePerQuantity: number }[]
        }>;
        const updatedDeliveryHistory = await DeliveryHistoryService.updateDeliveryHistory(id, deliveryHistoryData);
        sendResponse(res, 200, 'Transaction updated successfully', updatedDeliveryHistory);
    })

    static bulkUpdateDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const deliveryHistoryData = req.body as Array<{
            id: string
        } & Partial<NewDeliveryHistory & {
            "latestUnitPriceData": {
                unitId: string;
                pricePerQuantity: number;
            }[]
        }>>;
        const updatedDeliveryHistories = await DeliveryHistoryService.bulkUpdateDeliveryHistory(deliveryHistoryData);
        sendResponse(res, 200, 'Transactions updated successfully', updatedDeliveryHistories);
    })

    static deleteDeliveryHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedDeliveryHistory = await DeliveryHistoryService.deleteDeliveryHistory(id);
        sendResponse(res, 200, 'Transaction deleted successfully', deletedDeliveryHistory);
    })

    static getDeliveryHistories = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const deliveryHistories = await DeliveryHistoryService.getDeliveryHistories(pagination, filter);
        sendResponse(res, 200, 'Transactions fetched successfully', deliveryHistories);
    })

    static getDeliveryHistoryById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deliveryHistory = await DeliveryHistoryService.getDeliveryHistoryById(id);
        if (!deliveryHistory) {
            return sendResponse(res, 404, 'Transaction not found', null);
        }
        sendResponse(res, 200, 'Transaction fetched successfully', deliveryHistory);
    })
}