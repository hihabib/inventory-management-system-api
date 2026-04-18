import { Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewProductionHouseStock } from "../drizzle/schema/productionHouseStock";
import { stockAllocationAuditTable } from "../drizzle/schema/stockAllocationAudit";
import { stockConfigTable } from "../drizzle/schema/stockConfig";
import { AuthRequest } from "../middleware/auth";
import { ProductionHouseStockService } from "../service/productionHouseStock.service";
import { getFilterAndPaginationFromRequest, filterWithPaginate } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class ProductionHouseStockController {
    static createOrUpdateStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<NewProductionHouseStock & { id?: string }>;
        const userId = req.user.id;
        const result = await ProductionHouseStockService.createOrUpdateBulk(items, userId);
        sendResponse(res, 201, "Production stock processed successfully", result);
    });

    static updateStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<{ id: string } & Partial<NewProductionHouseStock>>;
        const userId = req.user.id;
        const result = await ProductionHouseStockService.updateBulk(items, userId);
        sendResponse(res, 200, "Production stock updated successfully", result);
    });

    static deleteStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<{ id: string; hardDelete?: boolean }>;
        const userId = req.user.id;
        const result = await ProductionHouseStockService.deleteBulk(items, userId);
        sendResponse(res, 200, "Production stock deleted successfully", result);
    });

    /**
     * Delete a single stock record (hard delete)
     * DELETE /production-house-stock/:id
     */
    static deleteOneStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const userId = req.user.id;
        const result = await ProductionHouseStockService.deleteOne(id, userId);
        sendResponse(res, 200, "Production stock deleted successfully", result);
    });

    static getStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const result = await ProductionHouseStockService.getStock(pagination, filter);
        sendResponse(res, 200, "Production stock fetched successfully", result);
    });

    static getStockById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const result = await ProductionHouseStockService.getStockById(id);
        if (!result) {
            return sendResponse(res, 404, "Production stock not found", null);
        }
        sendResponse(res, 200, "Production stock fetched successfully", result);
    });

    static getStockDetails = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId } = req.params;
        const result = await ProductionHouseStockService.getStockDetails(productId);
        sendResponse(res, 200, "Production stock details fetched successfully", result);
    });

    /**
     * Get edit history for a specific stock record
     * GET /production-house-stock/:id/edit-history
     */
    static getStockEditHistory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const result = await ProductionHouseStockService.getStockEditHistory(id);
        sendResponse(res, 200, "Edit history fetched successfully", result);
    });

    static resetStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const userId = req.user!.id;
        const result = await ProductionHouseStockService.resetStock(userId);
        sendResponse(res, 200, "Production stock reset completed successfully", result);
    });

    static getConfig = requestHandler(async (req: AuthRequest, res: Response) => {
        const configs = await db.select().from(stockConfigTable);
        sendResponse(res, 200, "Config fetched successfully", configs);
    });

    static updateConfig = requestHandler(async (req: AuthRequest, res: Response) => {
        const items = req.body as Array<{ key: string; value: string }>;
        const userId = req.user.id;
        const results = [];

        for (const item of items) {
            const [updated] = await db
                .update(stockConfigTable)
                .set({ value: item.value, updatedBy: userId, updatedAt: new Date() })
                .where(eq(stockConfigTable.key, item.key))
                .returning();
            if (updated) {
                results.push(updated);
            }
        }

        sendResponse(res, 200, "Config updated successfully", results);
    });

    static getAllocations = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { pagination } = getFilterAndPaginationFromRequest(req);

        const result = await filterWithPaginate(stockAllocationAuditTable, {
            pagination,
            filter: { stockId: [id] }
        });

        sendResponse(res, 200, "Allocations fetched successfully", result);
    });

    static getPendingShipments = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId, maintainsId } = req.query;

        if (!productId || typeof productId !== 'string') {
            return sendResponse(res, 400, 'Product ID is required', null);
        }

        const pendingShipments = await ProductionHouseStockService.getPendingShipments(
            productId,
            maintainsId as string | undefined
        );

        sendResponse(res, 200, 'Pending shipments fetched successfully', pendingShipments);
    });
}
