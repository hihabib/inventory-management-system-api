import { inventoryStocks, NewInventoryStock } from '../drizzle/schema/inventoryStock';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class InventoryStockService {
  // Create a new inventory stock
  static async createInventoryStock(stockData: NewInventoryStock) {
    const [createdStock] = await db.insert(inventoryStocks).values(stockData).returning();
    
    if (!createdStock) {
      throw new AppError('Failed to create inventory stock', 500);
    }
    
    return createdStock;
  }

  // Get all inventory stocks
  static async getAllInventoryStocks() {
    const allStocks = await db.select().from(inventoryStocks);
    return allStocks;
  }

  // Get inventory stock by ID
  static async getInventoryStockById(id: string) {
    const stock = await db
      .select()
      .from(inventoryStocks)
      .where(eq(inventoryStocks.id, id))
      .limit(1);
    
    if (stock.length === 0) {
      throw new AppError('Inventory stock not found', 404);
    }
    
    return stock[0];
  }

  // Update inventory stock
  static async updateInventoryStock(id: string, stockData: Partial<NewInventoryStock>) {
    const existingStock = await db
      .select()
      .from(inventoryStocks)
      .where(eq(inventoryStocks.id, id))
      .limit(1);
    
    if (existingStock.length === 0) {
      throw new AppError('Inventory stock not found', 404);
    }
    
    const [updatedStock] = await db
      .update(inventoryStocks)
      .set({ ...stockData, updatedAt: new Date() })
      .where(eq(inventoryStocks.id, id))
      .returning();
    
    return updatedStock;
  }

  // Delete inventory stock
  static async deleteInventoryStock(id: string) {
    const existingStock = await db
      .select()
      .from(inventoryStocks)
      .where(eq(inventoryStocks.id, id))
      .limit(1);
    
    if (existingStock.length === 0) {
      throw new AppError('Inventory stock not found', 404);
    }
    
    await db.delete(inventoryStocks).where(eq(inventoryStocks.id, id));
    
    return { success: true, message: 'Inventory stock deleted successfully' };
  }
}