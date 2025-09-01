// src/services/order.service.ts

import { db } from '../drizzle/db';
import { orders, Order, NewOrder } from '../drizzle/schema/order';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { inventoryItems } from '../drizzle/schema/inventoryItem';
import { units } from '../drizzle/schema/unit';
import { outlets } from '../drizzle/schema/outet';

// Define a type for the enhanced order data
export type OrderWithDetails = Omit<Order, 'productId' | 'outletId'> & {
    productName: string;
    productSku: string;
    productMainUnit: string;
    outletName: string;
    outletAddress: string;
};

export class OrderService {
    // Create a new order
    static async createOrder(orderData: Omit<NewOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
        const [createdOrder] = await db
            .insert(orders)
            .values(orderData)
            .returning();

        if (!createdOrder) {
            throw new AppError('Failed to create order', 500);
        }

        return createdOrder;
    }

    // Get an order by ID with details
    static async getOrderById(id: string): Promise<OrderWithDetails | null> {
        const result = await db
            .select({
                id: orders.id,
                quantity: orders.quantity,
                status: orders.status,
                neededBy: orders.neededBy,
                orderNote: orders.orderNote,
                createdAt: orders.createdAt,
                updatedAt: orders.updatedAt,
                productName: inventoryItems.productName,
                productSku: inventoryItems.sku,
                productMainUnit: units.unitLabel,
                outletName: outlets.name,
                outletAddress: outlets.location
            })
            .from(orders)
            .leftJoin(inventoryItems, eq(orders.productId, inventoryItems.id))
            .leftJoin(units, eq(inventoryItems.mainUnitId, units.id))
            .leftJoin(outlets, eq(orders.outletId, outlets.id))
            .where(eq(orders.id, id))
            .limit(1);

        if (result.length === 0) return null;
        const order = result[0];
        return {
            ...order,
            productName: order.productName ?? '',
            productSku: order.productSku ?? '',
            productMainUnit: order.productMainUnit ?? '',
            outletName: order.outletName ?? '',
            outletAddress: order.outletAddress ?? ''
        };
    }

    // Get all orders with details
    static async getAllOrders(): Promise<OrderWithDetails[]> {
        const result = await db
            .select({
                id: orders.id,
                quantity: orders.quantity,
                status: orders.status,
                neededBy: orders.neededBy,
                orderNote: orders.orderNote,
                createdAt: orders.createdAt,
                updatedAt: orders.updatedAt,
                productName: inventoryItems.productName,
                productSku: inventoryItems.sku,
                productMainUnit: units.unitLabel,
                outletName: outlets.name,
                outletAddress: outlets.location
            })
            .from(orders)
            .leftJoin(inventoryItems, eq(orders.productId, inventoryItems.id))
            .leftJoin(units, eq(inventoryItems.mainUnitId, units.id))
            .leftJoin(outlets, eq(orders.outletId, outlets.id));

        return result.map(order => ({
            ...order,
            productName: order.productName ?? '',
            productSku: order.productSku ?? '',
            productMainUnit: order.productMainUnit ?? '',
            outletName: order.outletName ?? '',
            outletAddress: order.outletAddress ?? ''
        }));
    }

    // Get orders by product ID with details
    static async getOrdersByProductId(productId: string): Promise<OrderWithDetails[]> {
        const result = await db
            .select({
                id: orders.id,
                quantity: orders.quantity,
                status: orders.status,
                neededBy: orders.neededBy,
                orderNote: orders.orderNote,
                createdAt: orders.createdAt,
                updatedAt: orders.updatedAt,
                productName: inventoryItems.productName,
                productSku: inventoryItems.sku,
                productMainUnit: units.unitLabel,
                outletName: outlets.name,
                outletAddress: outlets.location
            })
            .from(orders)
            .leftJoin(inventoryItems, eq(orders.productId, inventoryItems.id))
            .leftJoin(units, eq(inventoryItems.mainUnitId, units.id))
            .leftJoin(outlets, eq(orders.outletId, outlets.id))
            .where(eq(orders.productId, productId));

        return result.map(order => ({
            ...order,
            productName: order.productName ?? '',
            productSku: order.productSku ?? '',
            productMainUnit: order.productMainUnit ?? '',
            outletName: order.outletName ?? '',
            outletAddress: order.outletAddress ?? ''
        }));
    }

    // Get orders by outlet ID with details
    static async getOrdersByOutletId(outletId: string): Promise<OrderWithDetails[]> {
        const result = await db
            .select({
                id: orders.id,
                quantity: orders.quantity,
                status: orders.status,
                neededBy: orders.neededBy,
                orderNote: orders.orderNote,
                createdAt: orders.createdAt,
                updatedAt: orders.updatedAt,
                productName: inventoryItems.productName,
                productSku: inventoryItems.sku,
                productMainUnit: units.unitLabel,
                outletName: outlets.name,
                outletAddress: outlets.location
            })
            .from(orders)
            .leftJoin(inventoryItems, eq(orders.productId, inventoryItems.id))
            .leftJoin(units, eq(inventoryItems.mainUnitId, units.id))
            .leftJoin(outlets, eq(orders.outletId, outlets.id))
            .where(eq(orders.outletId, outletId));

        return result.map(order => ({
            ...order,
            productName: order.productName ?? '',
            productSku: order.productSku ?? '',
            productMainUnit: order.productMainUnit ?? '',
            outletName: order.outletName ?? '',
            outletAddress: order.outletAddress ?? ''
        }));
    }

    // Update an order
    static async updateOrder(id: string, updateData: Partial<Omit<NewOrder, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Order> {
        const [updatedOrder] = await db
            .update(orders)
            .set({
                ...updateData,
                updatedAt: new Date()
            })
            .where(eq(orders.id, id))
            .returning();

        if (!updatedOrder) {
            throw new AppError('Order not found', 404);
        }

        return updatedOrder;
    }

    // Delete an order
    static async deleteOrder(id: string): Promise<void> {
        const result = await db
            .delete(orders)
            .where(eq(orders.id, id))
            .returning({ id: orders.id });

        if (result.length === 0) {
            throw new AppError('Order not found', 404);
        }
    }
}