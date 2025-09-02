// src/services/inventoryTransaction.service.ts
import { and, asc, desc, eq, gte, lte, or, sql, inArray } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { inventoryItems } from '../drizzle/schema/inventoryItem';
import { inventoryTransactions, NewInventoryTransaction } from '../drizzle/schema/inventoryTransaction';
import { outlets } from '../drizzle/schema/outet';
import { Unit, units as unitsTable } from '../drizzle/schema/unit';
import { AppError } from '../utils/AppError';
import { InventoryItemService, InventoryItemWithDetails, OutletStockData, StockByUnit } from './inventoryItem.service';
import { inventoryStocks } from '../drizzle/schema/inventoryStock';
import { inventoryItemUnits } from '../drizzle/schema/inventoryItemUnit';
// Define the response type
export type InventoryTransactionWithDetails = {
    id: string;
    inventoryItem: {
        id: string;
        productName: string;
        sku: string;
    };
    stock: Record<string, OutletStockData[]>,
    outlet: {
        id: string;
        name: string;
    };
    orderedUnit: {
        id: string;
        unitLabel: string;
        unitSuffix: string;
    };
    inventoryItemUnits: Unit[];
    transactionType: string;
    status: string;
    quantity: number;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
};
// Define the response type for list view (simplified for performance) (but currently includes all details)
export type InventoryTransactionListItem = {
    id: string;
    inventoryItem: {
        id: string;
        productName: string;
        sku: string;
    };
    outlet: {
        id: string;
        name: string;
    };
    inventoryItemUnits: Unit[];
    orderedUnit: {
        id: string;
        unitLabel: string;
        unitSuffix: string;
    };
    transactionType: string;
    status: string;
    quantity: number;
    notes?: string;
    stock: Record<string, OutletStockData[]>; // Added stock field to list item type
    createdAt: Date;
    updatedAt: Date;
};
// Define paginated response type
export type PaginatedInventoryTransactions = {
    data: InventoryTransactionListItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
};
export class InventoryTransactionService {
    // Create a new inventory transaction
    static async createInventoryTransaction(transactionData: NewInventoryTransaction): Promise<InventoryTransactionWithDetails> {
        const [createdTransaction] = await db.insert(inventoryTransactions).values(transactionData).returning();
        if (!createdTransaction) {
            throw new AppError('Failed to create inventory transaction', 500);
        }
        // Get the complete transaction with details
        return this.getTransactionWithDetails(createdTransaction.id);
    }
    // Get all inventory transactions with filters, pagination and sorting
    static async getAllInventoryTransactions(
        filters: {
            outletId?: string;
            status?: string;
            transactionType?: string;
            createdAt?: {
                from?: string;
                to?: string;
            };
        } = {},
        pagination: {
            page?: number;
            limit?: number;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
        } = {}
    ): Promise<PaginatedInventoryTransactions> {
        const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
        const offset = (page - 1) * limit;
        // Build where conditions
        const whereConditions = [];
        if (filters.outletId) {
            whereConditions.push(eq(inventoryTransactions.outletId, filters.outletId));
        }
        if (filters.status) {
            console.log('status',filters.status);
            whereConditions.push(eq(inventoryTransactions.status, filters.status));
        }
        if (filters.transactionType) {
            
            whereConditions.push(eq(inventoryTransactions.transactionType, filters.transactionType));
        }
        if (filters.createdAt) {
            if (filters.createdAt.from) {
                // Parse the from date and ensure it's at the start of the day
                const fromDate = new Date(filters.createdAt.from);
                fromDate.setHours(0, 0, 0, 0);
                whereConditions.push(gte(inventoryTransactions.createdAt, fromDate));
            }
            if (filters.createdAt.to) {
                // Parse the to date and set it to the end of the day
                const toDate = new Date(filters.createdAt.to);
                toDate.setHours(23, 59, 59, 999);
                whereConditions.push(lte(inventoryTransactions.createdAt, toDate));
            }
        }
        // Get total count for pagination
        const countQuery = db
            .select({ count: sql<number>`count(*)` })
            .from(inventoryTransactions)
            .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
        const [{ count: total }] = await countQuery;
        // Build the main query with joins
        const transactionsQuery = db
            .select({
                id: inventoryTransactions.id,
                transactionType: inventoryTransactions.transactionType,
                status: inventoryTransactions.status,
                quantity: inventoryTransactions.quantity,
                notes: inventoryTransactions.notes,
                createdAt: inventoryTransactions.createdAt,
                updatedAt: inventoryTransactions.updatedAt,
                inventoryItem: {
                    id: inventoryItems.id,
                    productName: inventoryItems.productName,
                    sku: inventoryItems.sku,
                },
                outlet: {
                    id: outlets.id,
                    name: outlets.name,
                },
                orderedUnit: {
                    id: unitsTable.id,
                    unitLabel: unitsTable.unitLabel,
                    unitSuffix: unitsTable.unitSuffix,
                },
                // Include stock data with outlet information
                stockData: {
                    id: inventoryStocks.id,
                    outletId: inventoryStocks.outletId,
                    stocks: inventoryStocks.stocks,
                    createdAt: inventoryStocks.createdAt,
                    updatedAt: inventoryStocks.updatedAt,
                    outletName: outlets.name
                }
            })
            .from(inventoryTransactions)
            .leftJoin(inventoryItems, eq(inventoryTransactions.inventoryItemId, inventoryItems.id))
            .leftJoin(outlets, eq(inventoryTransactions.outletId, outlets.id))
            .leftJoin(unitsTable, eq(inventoryTransactions.orderedUnitId, unitsTable.id))
            // Join inventoryStocks to get stock data
            .leftJoin(inventoryStocks, and(
                eq(inventoryStocks.inventoryItemId, inventoryTransactions.inventoryItemId),
                eq(inventoryStocks.outletId, inventoryTransactions.outletId)
            ))
            .where(whereConditions.length > 0 ? and(...whereConditions) : undefined);
        // Apply sorting
        const sortField = inventoryTransactions[sortBy as keyof typeof inventoryTransactions.$inferSelect];
        if (sortField) {
            transactionsQuery.orderBy(
                sortOrder === 'desc' ? desc(sortField) : asc(sortField)
            );
        }
        // Apply pagination
        const transactions = await transactionsQuery.limit(limit).offset(offset);
        
        // Collect all inventory item IDs to fetch their units
        const inventoryItemIds = transactions
            .map(t => t.inventoryItem?.id)
            .filter((id): id is string => id !== undefined);
        
        // Fetch all units for these inventory items
        let unitsByInventoryItemId: Record<string, Unit[]> = {};
        if (inventoryItemIds.length > 0) {
            const itemUnits = await db
                .select({
                    inventoryItemId: inventoryItemUnits.inventoryItemId,
                    unit: {
                        id: unitsTable.id,
                        unitLabel: unitsTable.unitLabel,
                        unitSuffix: unitsTable.unitSuffix,
                        createdBy: unitsTable.createdBy,
                        createdAt: unitsTable.createdAt,
                        updatedAt: unitsTable.updatedAt
                    }
                })
                .from(inventoryItemUnits)
                .leftJoin(unitsTable, eq(inventoryItemUnits.unitId, unitsTable.id))
                .where(inArray(inventoryItemUnits.inventoryItemId, inventoryItemIds));
            
            // Group units by inventory item ID
            unitsByInventoryItemId = itemUnits.reduce((acc, item) => {
                if (!item.unit) return acc;
                
                if (!acc[item.inventoryItemId]) {
                    acc[item.inventoryItemId] = [];
                }
                acc[item.inventoryItemId].push(item.unit);
                return acc;
            }, {} as Record<string, Unit[]>);
        }
        
        // Group stocks by outlet for each transaction
        const transformedTransactions = transactions.map(transaction => {
            const stocksByOutlet: Record<string, OutletStockData[]> = {};
            
            if (transaction.stockData) {
                const outletName = transaction.stockData.outletName || `Outlet ${transaction.stockData.outletId}`;
                if (!stocksByOutlet[outletName]) {
                    stocksByOutlet[outletName] = [];
                }
                
                // Cast the stocks field to the expected type
                const stocksData = transaction.stockData.stocks as Record<string, StockByUnit>;
                
                // Add the outlet stock data
                stocksByOutlet[outletName].push({
                    stocks: stocksData,
                    stockId: transaction.stockData.id,
                    outletId: transaction.stockData.outletId,
                    createdAt: transaction.stockData.createdAt,
                    updatedAt: transaction.stockData.updatedAt
                });
            }
            
            return {
                id: transaction.id,
                transactionType: transaction.transactionType,
                status: transaction.status,
                quantity: transaction.quantity,
                notes: transaction.notes,
                createdAt: transaction.createdAt,
                updatedAt: transaction.updatedAt,
                inventoryItem: transaction.inventoryItem,
                outlet: transaction.outlet,
                orderedUnit: transaction.orderedUnit,
                inventoryItemUnits: transaction.inventoryItem?.id ? unitsByInventoryItemId[transaction.inventoryItem.id] || [] : [],
                stock: stocksByOutlet
            };
        });
        
        // Format the response
        return {
            data: transformedTransactions as InventoryTransactionListItem[],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    // Get inventory transaction by ID
    static async getInventoryTransactionById(id: string): Promise<InventoryTransactionWithDetails> {
        const transaction = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.id, id))
            .limit(1);
        if (transaction.length === 0) {
            throw new AppError('Inventory transaction not found', 404);
        }
        return this.getTransactionWithDetails(transaction[0].id);
    }
    // Update inventory transaction
    static async updateInventoryTransaction(id: string, transactionData: Partial<NewInventoryTransaction>): Promise<InventoryTransactionWithDetails> {
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
        // Get the complete transaction with details
        return this.getTransactionWithDetails(updatedTransaction.id);
    }
    // Delete inventory transaction
    static async deleteInventoryTransaction(id: string): Promise<{ success: boolean; message: string }> {
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
    // Get all orders (transactions with type 'order') using the efficient query
    static async getAllOrders(
        pagination: {
            page?: number;
            limit?: number;
            sortBy?: string;
            sortOrder?: 'asc' | 'desc';
        } = {}
    ): Promise<PaginatedInventoryTransactions> {
        return this.getAllInventoryTransactions(
            { transactionType: 'order' },
            pagination
        );
    }
    // Get order by ID
    static async getOrderById(id: string): Promise<InventoryTransactionWithDetails> {
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
        return this.getTransactionWithDetails(order[0].id);
    }
    // Helper method to get transaction with all related details
    private static async getTransactionWithDetails(transactionId: string): Promise<InventoryTransactionWithDetails> {
        // Get the transaction
        const transaction = await db
            .select()
            .from(inventoryTransactions)
            .where(eq(inventoryTransactions.id, transactionId))
            .limit(1);
        if (transaction.length === 0) {
            throw new AppError('Transaction not found', 404);
        }
        const tx = transaction[0];
        
        // Get simplified inventory item details
        const inventoryItem = await db
            .select({
                id: inventoryItems.id,
                productName: inventoryItems.productName,
                sku: inventoryItems.sku,
            })
            .from(inventoryItems)
            .where(eq(inventoryItems.id, tx.inventoryItemId!))
            .limit(1);
        if (inventoryItem.length === 0) {
            throw new AppError('Inventory item not found', 404);
        }
        
        // Get simplified outlet details
        const outlet = await db
            .select({
                id: outlets.id,
                name: outlets.name,
            })
            .from(outlets)
            .where(eq(outlets.id, tx.outletId!))
            .limit(1);
        if (outlet.length === 0) {
            throw new AppError('Outlet not found', 404);
        }
        
        // Get simplified ordered unit details
        const orderedUnit = await db
            .select({
                id: unitsTable.id,
                unitLabel: unitsTable.unitLabel,
                unitSuffix: unitsTable.unitSuffix,
            })
            .from(unitsTable)
            .where(eq(unitsTable.id, tx.orderedUnitId!))
            .limit(1);
        if (orderedUnit.length === 0) {
            throw new AppError('Ordered unit not found', 404);
        }
        
        // Get inventory item units
        const itemUnits = await db
            .select({
                unit: {
                    id: unitsTable.id,
                    unitLabel: unitsTable.unitLabel,
                    unitSuffix: unitsTable.unitSuffix,
                    createdBy: unitsTable.createdBy,
                    createdAt: unitsTable.createdAt,
                    updatedAt: unitsTable.updatedAt
                }
            })
            .from(inventoryItemUnits)
            .leftJoin(unitsTable, eq(inventoryItemUnits.unitId, unitsTable.id))
            .where(eq(inventoryItemUnits.inventoryItemId, tx.inventoryItemId!));
        
        // Extract unit objects
        const inventoryItemUnitsData = itemUnits
            .map(item => item.unit)
            .filter((unit): unit is Unit => unit !== undefined);
        
        // Get stock data for this inventory item and outlet
        const stocks = await db
            .select({
                id: inventoryStocks.id,
                outletId: inventoryStocks.outletId,
                stocks: inventoryStocks.stocks,
                createdAt: inventoryStocks.createdAt,
                updatedAt: inventoryStocks.updatedAt,
                outletName: outlets.name
            })
            .from(inventoryStocks)
            .leftJoin(outlets, eq(inventoryStocks.outletId, outlets.id))
            .where(and(
                eq(inventoryStocks.inventoryItemId, tx.inventoryItemId!),
                eq(inventoryStocks.outletId, tx.outletId!)
            ));
        
        // Group stocks by outlet
        const stocksByOutlet: Record<string, OutletStockData[]> = {};
        for (const stock of stocks) {
            const outletName = stock.outletName || `Outlet ${stock.outletId}`;
            if (!stocksByOutlet[outletName]) {
                stocksByOutlet[outletName] = [];
            }
            
            // Cast the stocks field to the expected type
            const stocksData = stock.stocks as Record<string, StockByUnit>;
            
            // Add the outlet stock data
            stocksByOutlet[outletName].push({
                stocks: stocksData,
                stockId: stock.id,
                outletId: stock.outletId,
                createdAt: stock.createdAt,
                updatedAt: stock.updatedAt
            });
        }
        
        // Format the response
        return {
            id: tx.id,
            inventoryItem: inventoryItem[0],
            outlet: outlet[0],
            orderedUnit: orderedUnit[0],
            inventoryItemUnits: inventoryItemUnitsData,
            transactionType: tx.transactionType,
            status: tx.status,
            quantity: tx.quantity,
            stock: stocksByOutlet,
            notes: tx.notes,
            createdAt: tx.createdAt,
            updatedAt: tx.updatedAt
        };
    }
}