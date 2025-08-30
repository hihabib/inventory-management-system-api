import { productionHouses, NewProductionHouse } from '../drizzle/schema/productionHouse';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class ProductionHouseService {
  // Create a new production house
  static async createProductionHouse(houseData: Omit<NewProductionHouse, 'id'>) {
    // Insert the production house into the database
    const [createdHouse] = await db.insert(productionHouses).values(houseData).returning();

    if (!createdHouse) {
      throw new AppError('Failed to create production house', 500);
    }

    return createdHouse;
  }

  // Get all production houses
  static async getAllProductionHouses() {
    const allHouses = await db.select().from(productionHouses);
    return allHouses;
  }

  // Get production house by ID
  static async getProductionHouseById(id: string) {
    const house = await db
      .select()
      .from(productionHouses)
      .where(eq(productionHouses.id, id))
      .limit(1);

    if (house.length === 0) {
      throw new AppError('Production house not found', 404);
    }

    return house[0];
  }

  // Update production house
  static async updateProductionHouse(id: string, houseData: Partial<Omit<NewProductionHouse, 'id'>>) {
    // Check if production house exists
    const existingHouse = await db
      .select()
      .from(productionHouses)
      .where(eq(productionHouses.id, id))
      .limit(1);

    if (existingHouse.length === 0) {
      throw new AppError('Production house not found', 404);
    }

    // Update the production house
    const [updatedHouse] = await db
      .update(productionHouses)
      .set({ ...houseData, updatedAt: new Date() })
      .where(eq(productionHouses.id, id))
      .returning();

    return updatedHouse;
  }

  // Delete production house
  static async deleteProductionHouse(id: string) {
    // Check if production house exists
    const existingHouse = await db
      .select()
      .from(productionHouses)
      .where(eq(productionHouses.id, id))
      .limit(1);

    if (existingHouse.length === 0) {
      throw new AppError('Production house not found', 404);
    }

    // Delete the production house
    await db.delete(productionHouses).where(eq(productionHouses.id, id));

    return { success: true, message: 'Production house deleted successfully' };
  }

  // Get production house by assigned user ID
  static async getProductionHouseByAssignedUserId(userId: string) {
    const productionHouse = await db
      .select()
      .from(productionHouses)
      .where(eq(productionHouses.assignedTo, userId))
      .limit(1);

    if (productionHouse.length === 0) {
      return [];
    }

    return productionHouse[0];
  }
}