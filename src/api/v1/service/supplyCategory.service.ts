import { supplyCategories, NewSupplyCategory } from '../drizzle/schema/supplyCategory';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class SupplyCategoryService {
  // Create a new supply category
  static async createSupplyCategory(categoryData: Omit<NewSupplyCategory, 'id'>) {
    // Check if category with same name or slug already exists
    const existingCategory = await db
      .select()
      .from(supplyCategories)
      .where(
        eq(supplyCategories.categoryName, categoryData.categoryName) || 
        eq(supplyCategories.categorySlug, categoryData.categorySlug)
      )
      .limit(1);
    
    if (existingCategory.length > 0) {
      throw new AppError('Supply category with this name or slug already exists', 409);
    }
    
    // Insert the category into the database
    const [createdCategory] = await db.insert(supplyCategories).values(categoryData).returning();
    
    if (!createdCategory) {
      throw new AppError('Failed to create supply category', 500);
    }
    
    return createdCategory;
  }

  // Get all supply categories
  static async getAllSupplyCategories() {
    const allCategories = await db.select().from(supplyCategories);
    return allCategories;
  }

  // Get supply category by ID
  static async getSupplyCategoryById(id: string) {
    const category = await db
      .select()
      .from(supplyCategories)
      .where(eq(supplyCategories.id, id))
      .limit(1);
    
    if (category.length === 0) {
      throw new AppError('Supply category not found', 404);
    }
    
    return category[0];
  }

  // Update supply category
  static async updateSupplyCategory(id: string, categoryData: Partial<Omit<NewSupplyCategory, 'id'>>) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(supplyCategories)
      .where(eq(supplyCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Supply category not found', 404);
    }
    
    // If updating categoryName or categorySlug, check for uniqueness
    if (categoryData.categoryName || categoryData.categorySlug) {
      const duplicateCategory = await db
        .select()
        .from(supplyCategories)
        .where(
          (categoryData.categoryName ? eq(supplyCategories.categoryName, categoryData.categoryName) : undefined) ||
          (categoryData.categorySlug ? eq(supplyCategories.categorySlug, categoryData.categorySlug) : undefined)
        )
        .limit(1);
      
      if (duplicateCategory.length > 0 && duplicateCategory[0].id !== id) {
        throw new AppError('Supply category with this name or slug already exists', 409);
      }
    }
    
    // Update the category
    const [updatedCategory] = await db
      .update(supplyCategories)
      .set({ ...categoryData, updatedAt: new Date() })
      .where(eq(supplyCategories.id, id))
      .returning();
    
    return updatedCategory;
  }

  // Delete supply category
  static async deleteSupplyCategory(id: string) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(supplyCategories)
      .where(eq(supplyCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Supply category not found', 404);
    }
    
    // Delete the category
    await db.delete(supplyCategories).where(eq(supplyCategories.id, id));
    
    return { success: true, message: 'Supply category deleted successfully' };
  }
}