import { Request, Response } from "express";
import { NewStock } from "../drizzle/schema/stock";
import { StockService } from "../service/stock.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class StockController {
    static createStock = requestHandler(async (req: Request, res: Response) => {
        const { maintainsId, pricePerQuantity, productId, quantity, unitId } = req.body as NewStock;
        const createdStock = await StockService.createStock({ maintainsId, pricePerQuantity, productId, quantity, unitId });
        sendResponse(res, 201, 'Stock created successfully', createdStock);
    })
    static updateStock = requestHandler(async (req: Request, res: Response) => {
        const { id, maintainsId, pricePerQuantity, productId, quantity, unitId } = req.body as NewStock & { id: string };
        const updatedStock = await StockService.updateStock({ id, maintainsId, pricePerQuantity, productId, quantity, unitId });
        sendResponse(res, 200, 'Stock updated successfully', updatedStock);
    })
    static deleteStock = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const deletedStock = await StockService.deleteStock(id);
        sendResponse(res, 200, 'Stock deleted successfully', deletedStock);
    })
    static getStocks = requestHandler(async (req: Request, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const stocks = await StockService.getStocks(pagination, filter);
        sendResponse(res, 200, 'Stocks fetched successfully', stocks);
    })
    static bulkCreateOrUpdateStock = requestHandler(async (req: Request, res: Response) => {
        const stocks = req.body as NewStock[];
        const results = await StockService.bulkCreateOrUpdateStock(stocks);
        sendResponse(res, 200, 'Bulk stock operation completed successfully', results);
    })

    static bulkCreateOrAddStock = requestHandler(async (req: Request, res: Response) => {
        const stocks = req.body as NewStock[];
        const results = await StockService.bulkCreateOrAddStock(stocks);
        sendResponse(res, 200, 'Bulk stock add operation completed successfully', results);
    })
}