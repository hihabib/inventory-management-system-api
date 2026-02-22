import { Response } from "express";
import { NewReadyProduct } from "../drizzle/schema/readyProduct";
import { AuthRequest } from "../middleware/auth";
import { ReadyProductService } from "../service/readyProduct.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class ReadyProductController {
    static createOrUpdateReadyProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<NewReadyProduct & { id?: string }>;
        const userId = req.user.id;
        const result = await ReadyProductService.createOrUpdateBulk(items, userId);
        sendResponse(res, 201, "Ready products processed successfully", result);
    });

    static updateReadyProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<{ id: string } & Partial<NewReadyProduct>>;
        const userId = req.user.id;
        const result = await ReadyProductService.updateBulk(items, userId);
        sendResponse(res, 200, "Ready products updated successfully", result);
    });

    static deleteReadyProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<{ id: string; hardDelete?: boolean }>;
        const userId = req.user.id;
        const result = await ReadyProductService.deleteBulk(items, userId);
        sendResponse(res, 200, "Ready products deleted successfully", result);
    });

    static getReadyProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const result = await ReadyProductService.getReadyProducts(pagination, filter);
        sendResponse(res, 200, "Ready products fetched successfully", result);
    });

    static getReadyProductById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const result = await ReadyProductService.getReadyProductById(id);
        if (!result) {
            return sendResponse(res, 404, "Ready product not found", null);
        }
        sendResponse(res, 200, "Ready product fetched successfully", result);
    });
}

