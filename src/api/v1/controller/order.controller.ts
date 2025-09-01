// src/controllers/order.controller.ts

import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { OrderService, OrderWithDetails } from '../service/order.service';
import { orders } from '../drizzle/schema/order';

export class OrderController {
    // Create a new order
    static createOrder = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId, outletId, quantity, status, neededBy, orderNote } = req.body;
        
        // Validate required fields
        if (!productId || !outletId || !quantity || !neededBy) {
            return sendResponse(res, 400, 'Product ID, outlet ID, quantity, and needed by date are required');
        }
        
        // Create the order
        const order = await OrderService.createOrder({
            productId,
            outletId,
            quantity,
            status: status || 'pending',
            neededBy: new Date(neededBy),
            orderNote: orderNote || null
        });
        
        // Get the order with details
        const orderWithDetails = await OrderService.getOrderById(order.id);
        
        sendResponse(res, 201, 'Order created successfully', orderWithDetails);
    });

    // Get an order by ID
    static getOrder = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        
        const order = await OrderService.getOrderById(id);
        
        if (!order) {
            return sendResponse(res, 404, 'Order not found');
        }
        
        sendResponse(res, 200, 'Order retrieved successfully', order);
    });

    // Get all orders
    static getAllOrders = requestHandler(async (req: AuthRequest, res: Response) => {
        const orders = await OrderService.getAllOrders();
        sendResponse(res, 200, 'Orders retrieved successfully', orders);
    });

    // Get orders by product ID
    static getOrdersByProduct = requestHandler(async (req: AuthRequest, res: Response) => {
        const { productId } = req.params;
        
        const orders = await OrderService.getOrdersByProductId(productId);
        sendResponse(res, 200, 'Orders retrieved successfully', orders);
    });

    // Get orders by outlet ID
    static getOrdersByOutlet = requestHandler(async (req: AuthRequest, res: Response) => {
        const { outletId } = req.params;
        
        const orders = await OrderService.getOrdersByOutletId(outletId);
        sendResponse(res, 200, 'Orders retrieved successfully', orders);
    });

    // Update an order
    static updateOrder = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { productId, outletId, quantity, status, neededBy, orderNote } = req.body;
        
        const updateData: Partial<Omit<typeof orders.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>> = {};
        
        if (productId !== undefined) updateData.productId = productId;
        if (outletId !== undefined) updateData.outletId = outletId;
        if (quantity !== undefined) updateData.quantity = quantity;
        if (status !== undefined) updateData.status = status;
        if (neededBy !== undefined) updateData.neededBy = new Date(neededBy);
        if (orderNote !== undefined) updateData.orderNote = orderNote;
        
        const order = await OrderService.updateOrder(id, updateData);
        
        // Get the updated order with details
        const orderWithDetails = await OrderService.getOrderById(id);
        
        sendResponse(res, 200, 'Order updated successfully', orderWithDetails);
    });

    // Delete an order
    static deleteOrder = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        
        await OrderService.deleteOrder(id);
        sendResponse(res, 200, 'Order deleted successfully');
    });
}