import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { StockBatchService } from "../service/stockBatch.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";

export class StockBatchController {
    /**
     * Add new stock batch with main unit input and manual unit prices
     * Accepts main unit quantity for auto-calculation and manual prices for each unit
     */
    static addNewStockBatch = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId, maintainsId, batchNumber, productionDate, mainUnitQuantity, unitPrices } = req.body;

        // Validation
        if (!productId || !maintainsId || !batchNumber || !mainUnitQuantity || !unitPrices) {
            return sendResponse(res, 400, 'Missing required fields: productId, maintainsId, batchNumber, mainUnitQuantity, unitPrices');
        }

        if (!Array.isArray(unitPrices) || unitPrices.length === 0) {
            return sendResponse(res, 400, 'unitPrices must be a non-empty array');
        }

        // Validate each unit price entry
        for (const unitPrice of unitPrices) {
            if (!unitPrice.unitId || typeof unitPrice.pricePerQuantity !== 'number') {
                return sendResponse(res, 400, 'Each unitPrice must have unitId (string) and pricePerQuantity (number)');
            }
            if (unitPrice.pricePerQuantity < 0) {
                return sendResponse(res, 400, 'All unit prices must be non-negative numbers');
            }
        }

        if (typeof mainUnitQuantity !== 'number' || mainUnitQuantity <= 0) {
            return sendResponse(res, 400, 'mainUnitQuantity must be a positive number');
        }

        const result = await StockBatchService.addNewStockBatch({
            productId,
            maintainsId,
            batchNumber,
            productionDate: productionDate ? new Date(productionDate) : undefined,
            mainUnitQuantity,
            unitPrices
        });

        sendResponse(res, 201, 'Stock batch created successfully', result);
    });

    /**
     * Process sale by specific stock ID with any unit quantity input
     * Now accepts quantity in any unit and automatically reduces all units proportionally
     */
    static processSaleByStockId = requestHandler(async (req: AuthRequest, res: Response) => {
        const { stockId } = req.params;
        const { unitId, quantity } = req.body;

        // Validation
        if (!unitId || typeof unitId !== 'string') {
            return sendResponse(res, 400, "Unit ID is required and must be a string", null);
        }
        if (typeof quantity !== 'number' || quantity <= 0) {
            return sendResponse(res, 400, "Quantity must be a positive number", null);
        }

        const result = await StockBatchService.processSaleByStockId(stockId, unitId, quantity);

        sendResponse(res, 200, 'Sale processed successfully', result);
    });

    /**
     * Process sale by batch ID with any unit quantity input (FIFO approach)
     * Now accepts quantity in any unit and automatically reduces all units proportionally
     */
    static processSaleByBatchAndUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { batchId } = req.params;
        const { unitId, quantity } = req.body;

        // Validation
        if (!unitId || typeof unitId !== 'string') {
            return sendResponse(res, 400, "Unit ID is required and must be a string", null);
        }
        if (typeof quantity !== 'number' || quantity <= 0) {
            return sendResponse(res, 400, "Quantity must be a positive number", null);
        }

        const result = await StockBatchService.processSaleByBatchAndUnit(batchId, unitId, quantity);

        sendResponse(res, 200, 'Sale processed successfully', result);
    });

    /**
     * Get stock by ID with batch information
     */
    static getStockById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const stock = await StockBatchService.getStockById(id);

        if (!stock) {
            return sendResponse(res, 404, 'Stock not found', null);
        }

        sendResponse(res, 200, 'Stock fetched successfully', stock);
    });

    /**
     * Get stocks by batch ID
     */
    static getStocksByBatch = requestHandler(async (req: AuthRequest, res: Response) => {
        const { batchId } = req.params;

        const stocks = await StockBatchService.getStocksByBatch(batchId);

        sendResponse(res, 200, 'Batch stocks fetched successfully', stocks);
    });

    /**
     * Get batch with all its stocks
     */
    static getBatchWithStocks = requestHandler(async (req: AuthRequest, res: Response) => {
        const { batchId } = req.params;

        const batch = await StockBatchService.getBatchWithStocks(batchId);

        if (!batch) {
            return sendResponse(res, 404, 'Batch not found', null);
        }

        sendResponse(res, 200, 'Batch with stocks fetched successfully', batch);
    });

    /**
     * Get available stock for a product across all batches
     */
    static getAvailableStockForProduct = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId } = req.params;
        const { maintainsId, unitId } = req.query;

        const availableStock = await StockBatchService.getAvailableStockForProduct(
            productId,
            maintainsId as string,
            unitId as string
        );

        sendResponse(res, 200, 'Available stock fetched successfully', availableStock);
    });

    /**
     * Get all batches with pagination and filtering
     */
    static getBatches = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);

        const result = await StockBatchService.getBatches(pagination, filter);

        sendResponse(res, 200, 'Batches fetched successfully', result);
    });

    /**
     * Get batch by ID
     */
    static getBatchById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const batch = await StockBatchService.getBatchById(id);

        if (!batch) {
            return sendResponse(res, 404, 'Batch not found', null);
        }

        sendResponse(res, 200, 'Batch fetched successfully', batch);
    });

    /**
     * Update batch information
     */
    static updateBatch = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { batchNumber, productionDate, maintainsId, mainUnitQuantity } = req.body;

        const updateData: any = {};
        if (batchNumber !== undefined) updateData.batchNumber = batchNumber;
        if (productionDate !== undefined) updateData.productionDate = new Date(productionDate);
        if (maintainsId !== undefined) updateData.maintainsId = maintainsId;
        if (mainUnitQuantity !== undefined) {
            if (typeof mainUnitQuantity !== 'number' || mainUnitQuantity < 0) {
                return sendResponse(res, 400, 'mainUnitQuantity must be a non-negative number');
            }
            updateData.mainUnitQuantity = mainUnitQuantity;
        }

        if (Object.keys(updateData).length === 0) {
            return sendResponse(res, 400, "No valid fields provided for update", null);
        }

        const updatedBatch = await StockBatchService.updateBatch(id, updateData);

        sendResponse(res, 200, "Batch updated successfully", updatedBatch);
    });

    /**
     * Update individual stock with main unit input and manual unit prices
     * Now accepts main unit quantity and manual prices for each unit
     */
    static updateStock = requestHandler(async (req: AuthRequest, res: Response) => {
        const { stockId } = req.params;
        const { mainUnitQuantity, unitPrices } = req.body;

        // Validation
        if (mainUnitQuantity !== undefined && (typeof mainUnitQuantity !== 'number' || mainUnitQuantity < 0)) {
            return sendResponse(res, 400, "Main unit quantity must be a non-negative number", null);
        }

        if (unitPrices !== undefined) {
            if (!Array.isArray(unitPrices) || unitPrices.length === 0) {
                return sendResponse(res, 400, "Unit prices must be a non-empty array", null);
            }

            for (const unitPrice of unitPrices) {
                if (!unitPrice.unitId || typeof unitPrice.unitId !== 'string') {
                    return sendResponse(res, 400, "Each unit price must have a valid unitId", null);
                }
                if (typeof unitPrice.pricePerQuantity !== 'number' || unitPrice.pricePerQuantity < 0) {
                    return sendResponse(res, 400, "Each unit price must have a non-negative pricePerQuantity", null);
                }
            }
        }

        const updateData: any = {};
        if (mainUnitQuantity !== undefined) updateData.mainUnitQuantity = mainUnitQuantity;
        if (unitPrices !== undefined) updateData.unitPrices = unitPrices;

        if (Object.keys(updateData).length === 0) {
            return sendResponse(res, 400, "No valid fields provided for update", null);
        }

        const updatedStock = await StockBatchService.updateStock(stockId, updateData);

        sendResponse(res, 200, "Stock updated successfully", updatedStock);
    });

    /**
     * Update multiple stocks in a batch with main unit input and manual unit prices
     * Now accepts main unit quantity and manual prices for each unit
     */
    static updateBatchStocks = requestHandler(async (req: AuthRequest, res: Response) => {
        const { batchId } = req.params;
        const { mainUnitQuantity, unitPrices } = req.body;

        // Validation
        if (mainUnitQuantity !== undefined && (typeof mainUnitQuantity !== 'number' || mainUnitQuantity < 0)) {
            return sendResponse(res, 400, "Main unit quantity must be a non-negative number", null);
        }

        if (unitPrices !== undefined) {
            if (!Array.isArray(unitPrices) || unitPrices.length === 0) {
                return sendResponse(res, 400, "Unit prices must be a non-empty array", null);
            }

            for (const unitPrice of unitPrices) {
                if (!unitPrice.unitId || typeof unitPrice.unitId !== 'string') {
                    return sendResponse(res, 400, "Each unit price must have a valid unitId", null);
                }
                if (typeof unitPrice.pricePerQuantity !== 'number' || unitPrice.pricePerQuantity <= 0) {
                    return sendResponse(res, 400, "Each unit price must have a positive pricePerQuantity", null);
                }
            }
        }

        const updateData: any = {};
        if (mainUnitQuantity !== undefined) updateData.mainUnitQuantity = mainUnitQuantity;
        if (unitPrices !== undefined) updateData.unitPrices = unitPrices;

        if (Object.keys(updateData).length === 0) {
            return sendResponse(res, 400, "No valid fields provided for update", null);
        }

        const updatedStocks = await StockBatchService.updateBatchStocks(batchId, updateData);

        sendResponse(res, 200, "Batch stocks updated successfully", updatedStocks);
    });


}