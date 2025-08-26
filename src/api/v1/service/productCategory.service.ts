import { productCategories, NewProductCategory } from '../drizzle/schema/productCategory';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class ProductCategoryService {
  // Create a new product category
  static async createProductCategory(categoryData: Omit<NewProductCategory, 'id'>) {
    // Check if category with same name or slug already exists
    const existingCategory = await db
      .select()
      .from(productCategories)
      .where(
        eq(productCategories.categoryName, categoryData.categoryName) || 
        eq(productCategories.categorySlug, categoryData.categorySlug)
      )
      .limit(1);
    
    if (existingCategory.length > 0) {
      throw new AppError('Product category with this name or slug already exists', 409);
    }
    
    // Insert the category into the database
    const [createdCategory] = await db.insert(productCategories).values(categoryData).returning();
    
    if (!createdCategory) {
      throw new AppError('Failed to create product category', 500);
    }
    
    return createdCategory;
  }

  // Get all product categories
  static async getAllProductCategories() {
    const allCategories = await db.select().from(productCategories);
    return allCategories;
  }

  // Get product category by ID
  static async getProductCategoryById(id: string) {
    const category = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, id))
      .limit(1);
    
    if (category.length === 0) {
      throw new AppError('Product category not found', 404);
    }
    
    return category[0];
  }

  // Update product category
  static async updateProductCategory(id: string, categoryData: Partial<Omit<NewProductCategory, 'id'>>) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Product category not found', 404);
    }
    
    // If updating categoryName or categorySlug, check for uniqueness
    if (categoryData.categoryName || categoryData.categorySlug) {
      const duplicateCategory = await db
        .select()
        .from(productCategories)
        .where(
          (categoryData.categoryName ? eq(productCategories.categoryName, categoryData.categoryName) : undefined) ||
          (categoryData.categorySlug ? eq(productCategories.categorySlug, categoryData.categorySlug) : undefined)
        )
        .limit(1);
      
      if (duplicateCategory.length > 0 && duplicateCategory[0].id !== id) {
        throw new AppError('Product category with this name or slug already exists', 409);
      }
    }
    
    // Update the category
    const [updatedCategory] = await db
      .update(productCategories)
      .set({ ...categoryData, updatedAt: new Date() })
      .where(eq(productCategories.id, id))
      .returning();
    
    return updatedCategory;
  }

  // Delete product category
  static async deleteProductCategory(id: string) {
    // Check if category exists
    const existingCategory = await db
      .select()
      .from(productCategories)
      .where(eq(productCategories.id, id))
      .limit(1);
    
    if (existingCategory.length === 0) {
      throw new AppError('Product category not found', 404);
    }
    
    // Delete the category
    await db.delete(productCategories).where(eq(productCategories.id, id));
    
    return { success: true, message: 'Product category deleted successfully' };
  }
}