import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { SupplyItemService } from '../service/supplyItem.service';

export class SupplyItemController {
  // Create a new supply item
  static createSupplyItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { 
      productName, 
      sku, 
      image, 
      supplierName, 
      lowStockThreshold,
      mainUnitId,
      categoryIds,
      unitIds,
      stocks
    } = req.body;
    
    if (!productName || !sku || !mainUnitId) {
      return sendResponse(res, 400, 'Product name, SKU, and main unit ID are required');
    }
    
    // Get the user ID from the authenticated request
    const createdBy = req.user?.id;
    
    const newItem = await SupplyItemService.createSupplyItem({
      productName,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnitId,
      categoryIds,
      unitIds,
      stocks
    }, createdBy);
    
    sendResponse(res, 201, 'Supply item created successfully', newItem);
  });
  
  // Get all supply items
  static getAllSupplyItems = requestHandler(async (req: AuthRequest, res: Response) => {
    const allItems = await SupplyItemService.getAllSupplyItems();
    
    sendResponse(res, 200, 'Supply items retrieved successfully', allItems);
  });
  
  // Get supply item by ID
  static getSupplyItemById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const item = await SupplyItemService.getSupplyItemById(id);
    
    sendResponse(res, 200, 'Supply item retrieved successfully', item);
  });
  
  // Update supply item
  static updateSupplyItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const itemData = req.body;
    
    const updatedItem = await SupplyItemService.updateSupplyItem(id, itemData);
    
    sendResponse(res, 200, 'Supply item updated successfully', updatedItem);
  });
  
  // Delete supply item
  static deleteSupplyItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await SupplyItemService.deleteSupplyItem(id);
    
    sendResponse(res, 200, result.message);
  });
}