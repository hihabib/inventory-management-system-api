import { supplyStocks, NewSupplyStock } from '../drizzle/schema/supplyStock';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class SupplyStockService {
  // Create a new supply stock
  static async createSupplyStock(stockData: NewSupplyStock) {
    const [createdStock] = await db.insert(supplyStocks).values(stockData).returning();
    
    if (!createdStock) {
      throw new AppError('Failed to create supply stock', 500);
    }
    
    return createdStock;
  }

  // Get all supply stocks
  static async getAllSupplyStocks() {
    const allStocks = await db.select().from(supplyStocks);
    return allStocks;
  }

  // Get supply stock by ID
  static async getSupplyStockById(id: string) {
    const stock = await db
      .select()
      .from(supplyStocks)
      .where(eq(supplyStocks.id, id))
      .limit(1);
    
    if (stock.length === 0) {
      throw new AppError('Supply stock not found', 404);
    }
    
    return stock[0];
  }

  // Update supply stock
  static async updateSupplyStock(id: string, stockData: Partial<NewSupplyStock>) {
    const existingStock = await db
      .select()
      .from(supplyStocks)
      .where(eq(supplyStocks.id, id))
      .limit(1);
    
    if (existingStock.length === 0) {
      throw new AppError('Supply stock not found', 404);
    }
    
    const [updatedStock] = await db
      .update(supplyStocks)
      .set({ ...stockData, updatedAt: new Date() })
      .where(eq(supplyStocks.id, id))
      .returning();
    
    return updatedStock;
  }

  // Delete supply stock
  static async deleteSupplyStock(id: string) {
    const existingStock = await db
      .select()
      .from(supplyStocks)
      .where(eq(supplyStocks.id, id))
      .limit(1);
    
    if (existingStock.length === 0) {
      throw new AppError('Supply stock not found', 404);
    }
    
    await db.delete(supplyStocks).where(eq(supplyStocks.id, id));
    
    return { success: true, message: 'Supply stock deleted successfully' };
  }
}