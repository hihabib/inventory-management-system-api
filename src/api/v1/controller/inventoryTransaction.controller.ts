import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { InventoryTransactionService } from '../service/inventoryTransaction.service';

export class InventoryTransactionController {
  // Create a new inventory transaction
  static createInventoryTransaction = requestHandler(async (req: AuthRequest, res: Response) => {
    const transactionData = req.body;
    
    if (!transactionData.inventoryItemId || !transactionData.transactionType || !transactionData.status || transactionData.quantity === undefined) {
      return sendResponse(res, 400, 'Inventory item ID, transaction type, status, and quantity are required');
    }
    
    const newTransaction = await InventoryTransactionService.createInventoryTransaction(transactionData);
    
    sendResponse(res, 201, 'Inventory transaction created successfully', newTransaction);
  });
  
  // Get all inventory transactions
  static getAllInventoryTransactions = requestHandler(async (req: AuthRequest, res: Response) => {
    const allTransactions = await InventoryTransactionService.getAllInventoryTransactions();
    
    sendResponse(res, 200, 'Inventory transactions retrieved successfully', allTransactions);
  });
  
  // Get inventory transaction by ID
  static getInventoryTransactionById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const transaction = await InventoryTransactionService.getInventoryTransactionById(id);
    
    sendResponse(res, 200, 'Inventory transaction retrieved successfully', transaction);
  });
  
  // Update inventory transaction
  static updateInventoryTransaction = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const transactionData = req.body;
    
    const updatedTransaction = await InventoryTransactionService.updateInventoryTransaction(id, transactionData);
    
    sendResponse(res, 200, 'Inventory transaction updated successfully', updatedTransaction);
  });
  
  // Delete inventory transaction
  static deleteInventoryTransaction = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await InventoryTransactionService.deleteInventoryTransaction(id);
    
    sendResponse(res, 200, result.message);
  });
  
  // Get all orders
  static getAllOrders = requestHandler(async (req: AuthRequest, res: Response) => {
    const allOrders = await InventoryTransactionService.getAllOrders();
    
    sendResponse(res, 200, 'Orders retrieved successfully', allOrders);
  });
  
  // Get order by ID
  static getOrderById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const order = await InventoryTransactionService.getOrderById(id);
    
    sendResponse(res, 200, 'Order retrieved successfully', order);
  });
}