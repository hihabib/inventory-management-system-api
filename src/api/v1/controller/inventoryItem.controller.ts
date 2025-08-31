import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { InventoryItemService, InventoryItemWithDetails } from '../service/inventoryItem.service';

export class InventoryItemController {
  // Create a new inventory item
  static createInventoryItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { 
      productName, 
      sku, 
      image, 
      supplierName, 
      lowStockThreshold,
      mainUnit,
      categories,
      units,
      outlets,

    } = req.body as InventoryItemWithDetails;
    
    if (!productName || !sku || !mainUnit) {
      return sendResponse(res, 400, 'Product name, SKU, and main unit are required');
    }
    
    // Get the user ID from the authenticated request
    const createdBy = req.user?.id;
    
    const newItem = await InventoryItemService.createInventoryItem({
      productName,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnit,
      categories,
      units,
      outlets
    }, createdBy);
    
    sendResponse(res, 201, 'Inventory item created successfully', newItem);
  });
  
  // Get all inventory items
  static getAllInventoryItems = requestHandler(async (req: AuthRequest, res: Response) => {
    const allItems = await InventoryItemService.getAllInventoryItems(req.user);
    
    sendResponse(res, 200, 'Inventory items retrieved successfully', allItems);
  });
  
  // Get inventory item by ID
  static getInventoryItemById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const item = await InventoryItemService.getInventoryItemById(id);
    
    sendResponse(res, 200, 'Inventory item retrieved successfully', item);
  });
  
  // Update inventory item
  static updateInventoryItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const itemData = req.body;
    
    const updatedItem = await InventoryItemService.updateInventoryItem(id, itemData);
    
    sendResponse(res, 200, 'Inventory item updated successfully', updatedItem);
  });
  
  // Delete inventory item
  static deleteInventoryItem = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await InventoryItemService.deleteInventoryItem(id);
    
    sendResponse(res, 200, result.message);
  });
}