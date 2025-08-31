import { customerCategories, NewCustomerCategory } from '../drizzle/schema/customerCategory';
import { eq, getTableColumns, ne, sql } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class CustomerCategoryService {
  // Create a new customer category
  static async createCustomerCategory(categoryData: Omit<NewCustomerCategory, 'id'>) {
    // Check if category with same name or slug already exists
    const existingCategory = await db
      .select()
      .from(customerCategories)
      .where(
        eq(customerCategories.categoryName, categoryData.categoryName) || 
        eq(customerCategories.categorySlug, categoryData.categorySlug)
      )
      .limit(1);
    
    if (existingCategory.length > 0) {
      throw new AppError('Customer category with this name or slug already exists', 409);
    }
    
    // Insert the category into the database
    const [createdCategory] = await db.insert(customerCategories).values(categoryData).returning();
    
    if (!createdCategory) {
      throw new AppError('Failed to create customer category', 500);
    }
    
    return createdCategory;
  }

  // Get all customer categories
  static async getAllCustomerCategories() {
    const allCategories = await db.select().from(customerCategories);
    return allCategories;
  }

  // Get customer category by ID
  static async getCustomerCategoryById(id: string) {
    const category = await db
      .select()
      .from(customerCategories)
      .where(eq(customerCategories.id, id))
      .limit(1);
    
    if (category.length === 0) {
      throw new AppError('Customer category not found', 404);
    }
    
    return category[0];
  }

  // Update customer category
  static async updateCustomerCategory(id: string, categoryData: Partial<Omit<NewCustomerCategory, 'id'>>) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(customerCategories)
      .where(eq(customerCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Customer category not found', 404);
    }
    
    // If updating categoryName or categorySlug, check for uniqueness
    if (categoryData.categoryName || categoryData.categorySlug) {
      const duplicateCategory = await db
        .select()
        .from(customerCategories)
        .where(
          (categoryData.categoryName ? eq(customerCategories.categoryName, categoryData.categoryName) : undefined) ||
          (categoryData.categorySlug ? eq(customerCategories.categorySlug, categoryData.categorySlug) : undefined)
        )
        .limit(1);
      
      if (duplicateCategory.length > 0 && duplicateCategory[0].id !== id) {
        throw new AppError('Customer category with this name or slug already exists', 409);
      }
    }
    
    // If setting this category as default, set all others to false
    if (categoryData.isDefault === true) {
      await db
        .update(customerCategories)
        .set({ isDefault: false })
        .where(ne(customerCategories.id, id));
    }
    
    // Update the category
    const [updatedCategory] = await db
      .update(customerCategories)
      .set({ ...categoryData, updatedAt: new Date() })
      .where(eq(customerCategories.id, id))
      .returning();
    
    return updatedCategory;
  }

  // Delete customer category
  static async deleteCustomerCategory(id: string) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(customerCategories)
      .where(eq(customerCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Customer category not found', 404);
    }
    
    // Delete the category
    await db.delete(customerCategories).where(eq(customerCategories.id, id));
    
    return { success: true, message: 'Customer category deleted successfully' };
  }

  // Get default customer category
  static async getDefaultCustomerCategory() {
    const defaultCategory = await db
      .select()
      .from(customerCategories)
      .where(eq(customerCategories.isDefault, true))
      .limit(1);
    
    if (defaultCategory.length === 0) {
      throw new AppError('No default customer category found', 404);
    }
    
    return defaultCategory[0];
  }
}