import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { InventoryStockService } from '../service/inventoryStock.service';

export class InventoryStockController {
  // Create a new inventory stock
  static createInventoryStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const stockData = req.body;
    
    if (!stockData.inventoryItemId || !stockData.outletId  || stockData.stocks === undefined) {
      return sendResponse(res, 400, 'Inventory item ID, outlet ID, and stocks are required');
    }
    
    const newStock = await InventoryStockService.createInventoryStock(stockData);
    
    sendResponse(res, 201, 'Inventory stock created successfully', newStock);
  });
  
  // Get all inventory stocks
  static getAllInventoryStocks = requestHandler(async (req: AuthRequest, res: Response) => {
    const allStocks = await InventoryStockService.getAllInventoryStocks();
    
    sendResponse(res, 200, 'Inventory stocks retrieved successfully', allStocks);
  });
  
  // Get inventory stock by ID
  static getInventoryStockById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const stock = await InventoryStockService.getInventoryStockById(id);
    
    sendResponse(res, 200, 'Inventory stock retrieved successfully', stock);
  });
  
  // Update inventory stock
  static updateInventoryStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const stockData = req.body;
    
    const updatedStock = await InventoryStockService.updateInventoryStock(id, stockData);
    
    sendResponse(res, 200, 'Inventory stock updated successfully', updatedStock);
  });
  
  // Delete inventory stock
  static deleteInventoryStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await InventoryStockService.deleteInventoryStock(id);
    
    sendResponse(res, 200, result.message);
  });
}