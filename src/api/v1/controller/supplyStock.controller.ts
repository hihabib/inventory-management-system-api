import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { SupplyStockService } from '../service/supplyStock.service';

export class SupplyStockController {
  // Create a new supply stock
  static createSupplyStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const stockData = req.body;
    
    if (!stockData.supplyItemId || !stockData.productionHouseId || !stockData.unitId || stockData.stock === undefined || stockData.pricePerUnit === undefined) {
      return sendResponse(res, 400, 'Supply item ID, production house ID, unit ID, stock, and price per unit are required');
    }
    
    const newStock = await SupplyStockService.createSupplyStock(stockData);
    
    sendResponse(res, 201, 'Supply stock created successfully', newStock);
  });
  
  // Get all supply stocks
  static getAllSupplyStocks = requestHandler(async (req: AuthRequest, res: Response) => {
    const allStocks = await SupplyStockService.getAllSupplyStocks();
    
    sendResponse(res, 200, 'Supply stocks retrieved successfully', allStocks);
  });
  
  // Get supply stock by ID
  static getSupplyStockById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const stock = await SupplyStockService.getSupplyStockById(id);
    
    sendResponse(res, 200, 'Supply stock retrieved successfully', stock);
  });
  
  // Update supply stock
  static updateSupplyStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const stockData = req.body;
    
    const updatedStock = await SupplyStockService.updateSupplyStock(id, stockData);
    
    sendResponse(res, 200, 'Supply stock updated successfully', updatedStock);
  });
  
  // Delete supply stock
  static deleteSupplyStock = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await SupplyStockService.deleteSupplyStock(id);
    
    sendResponse(res, 200, result.message);
  });
}