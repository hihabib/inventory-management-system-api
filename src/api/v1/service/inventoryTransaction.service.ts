import { inventoryTransactions, NewInventoryTransaction } from '../drizzle/schema/inventoryTransaction';
import { and, eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { InventoryItemService } from './inventoryItem.service';
import { units as unitsTable } from '../drizzle/schema/unit';
import { db } from '../drizzle/db';
import { outlets } from '../drizzle/schema/outet';

export class InventoryTransactionService {
    // Create a new inventory transaction
    static async createInventoryTransaction(transactionData: NewInventoryTransaction) {
        const [createdTransaction] = await db.insert(inventoryTransactions).values(transactionData).returning();

        if (!createdTransaction) {
            throw new AppError('Failed to create inventory transaction', 500);
        }

        return createdTransaction;
    }

    // Get all inventory transactions
    static async getAllInventoryTransactions() {
        const allTransactions = await db.select().from(inventoryTransactions);
        return allTransactions;
    }

    // Get inventory transaction by ID
    static async getInventoryTransactionById(id: string) {
        const transaction = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.id, id))
            .limit(1);

        if (transaction.length === 0) {
            throw new AppError('Inventory transaction not found', 404);
        }

        return transaction[0];
    }

    // Update inventory transaction
    static async updateInventoryTransaction(id: string, transactionData: Partial<NewInventoryTransaction>) {
        const existingTransaction = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.id, id))
            .limit(1);

        if (existingTransaction.length === 0) {
            throw new AppError('Inventory transaction not found', 404);
        }

        const [updatedTransaction] = await db
            .update(inventoryTransactions)
            .set({ ...transactionData, updatedAt: new Date() })
            .where(eq(inventoryTransactions.id, id))
            .returning();

        return updatedTransaction;
    }

    // Delete inventory transaction
    static async deleteInventoryTransaction(id: string) {
        const existingTransaction = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.id, id))
            .limit(1);

        if (existingTransaction.length === 0) {
            throw new AppError('Inventory transaction not found', 404);
        }

        await db.delete(inventoryTransactions).where(eq(inventoryTransactions.id, id));

        return { success: true, message: 'Inventory transaction deleted successfully' };
    }

    // Get all orders (transactions with type 'order')
    static async getAllOrders() {
        const orders = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.transactionType, 'order'));

        // For each order, fetch related data
        const ordersWithDetails = await Promise.all(orders.map(async (order) => {
            // Get product details
            const product = await InventoryItemService.getInventoryItemById(order.inventoryItemId!);

            // Get outlet details
            const outlet = await db
                .select()
                .from(outlets)
                .where(eq(outlets.id, order.outletId!))
                .limit(1);

            // Get ordered unit details
            const orderedUnit = await db
                .select({
                    id: unitsTable.id,
                    unitLabel: unitsTable.unitLabel,
                    unitSuffix: unitsTable.unitSuffix,
                    createdBy: unitsTable.createdBy,
                    createdAt: unitsTable.createdAt,
                    updatedAt: unitsTable.updatedAt
                })
                .from(unitsTable)
                .where(eq(unitsTable.id, order.orderedUnitId!))
                .limit(1);

            return {
                ...order,
                product,
                outlet: outlet[0] || null,
                orderedUnit: orderedUnit[0] || null
            };
        }));

        return ordersWithDetails;
    }

    // Get order by ID
    static async getOrderById(id: string) {
        const order = await db
            .select()
            .from(inventoryTransactions)
            .where(
                and(
                    eq(inventoryTransactions.id, id),
                    eq(inventoryTransactions.transactionType, "order")
                )
            )
            .limit(1);

        if (order.length === 0) {
            throw new AppError('Order not found', 404);
        }

        // Get product details
        const product = await InventoryItemService.getInventoryItemById(order[0].inventoryItemId!);

        // Get outlet details
        const outlet = await db
            .select()
            .from(outlets)
            .where(eq(outlets.id, order[0].outletId!))
            .limit(1);

        // Get ordered unit details
        const orderedUnit = await db
            .select({
                id: unitsTable.id,
                unitLabel: unitsTable.unitLabel,
                unitSuffix: unitsTable.unitSuffix,
                createdBy: unitsTable.createdBy,
                createdAt: unitsTable.createdAt,
                updatedAt: unitsTable.updatedAt
            })
            .from(unitsTable)
            .where(eq(unitsTable.id, order[0].orderedUnitId!))
            .limit(1);

        return {
            ...order[0],
            product,
            outlet: outlet[0] || null,
            orderedUnit: orderedUnit[0] || null
        };
    }
}