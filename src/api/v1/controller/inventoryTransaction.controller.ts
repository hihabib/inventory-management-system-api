// src/controllers/inventoryTransaction.controller.ts
import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { InventoryTransactionService, InventoryTransactionWithDetails } from '../service/inventoryTransaction.service';

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

  // Get all inventory transactions with pagination and sorting
  static getAllInventoryTransactions = requestHandler(async (req: AuthRequest, res: Response) => {
    // Extract query parameters
    const {
      outletId,
      status,
      transactionType,
      createdAtFrom, // Changed from nested object to separate parameters
      createdAtTo,   // Changed from nested object to separate parameters
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filters object
    const filters: {
      outletId?: string;
      status?: string;
      transactionType?: string;
      createdAt?: {
        from?: string;
        to?: string;
      };
    } = {};

    if (outletId && typeof outletId === 'string') {
      filters.outletId = outletId;
    }
    if (status && typeof status === 'string') {
      console.log("controller status", status);
      filters.status = status;
    }
    if (transactionType && typeof transactionType === 'string') {
      filters.transactionType = transactionType;
    }
    
    // Handle date range with separate parameters
    if (createdAtFrom || createdAtTo) {
      filters.createdAt = {};
      if (createdAtFrom && typeof createdAtFrom === 'string') {
        filters.createdAt.from = createdAtFrom;
      }
      if (createdAtTo && typeof createdAtTo === 'string') {
        filters.createdAt.to = createdAtTo;
      }
    }

    // Build pagination options
    const paginationOptions = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sortBy: sortBy as string,
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
    };
    console.log(filters);
    
    const result = await InventoryTransactionService.getAllInventoryTransactions(filters, paginationOptions);
    sendResponse(res, 200, 'Inventory transactions retrieved successfully', result);
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

  // Get all orders with pagination
  static getAllOrders = requestHandler(async (req: AuthRequest, res: Response) => {
    const {
      page = '1',
      limit = '10',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const paginationOptions = {
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      sortBy: sortBy as string,
      sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
    };

    const result = await InventoryTransactionService.getAllOrders(paginationOptions);
    sendResponse(res, 200, 'Orders retrieved successfully', result);
  });

  // Get order by ID
  static getOrderById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const order = await InventoryTransactionService.getOrderById(id);
    sendResponse(res, 200, 'Order retrieved successfully', order);
  });
}