import { eq, and, inArray, like, or } from 'drizzle-orm';
import { db } from '../drizzle/db';
import { NewUserMeta, userMetaTable } from '../drizzle/schema/userMeta';
import { AppError } from '../utils/AppError';
import { getCurrentDate } from '../utils/timezone';
import { productTable } from '../drizzle/schema/product';

export class UserMetaService {
  // Get user metadata by keys (or all if no keys provided)
  static async getUserMeta(userId: string, keys?: string[]): Promise<Record<string, any>> {
    // If no keys provided, get all user metadata
    // If keys provided, get only those keys
    const whereCondition = keys
      ? and(eq(userMetaTable.userId, userId), inArray(userMetaTable.key, keys))
      : eq(userMetaTable.userId, userId);

    const metadata = await db.select()
      .from(userMetaTable)
      .where(whereCondition);

    // Convert array to key-value object
    const result: Record<string, any> = {};
    for (const meta of metadata) {
      result[meta.key] = meta.value;
    }

    return result;
  }

  // Search hold items by reference name and/or product name
  static async searchHoldItems(
    userId: string,
    searchQuery?: string
  ): Promise<Record<string, any>> {
    // Get hold_items metadata
    const metadata = await db.select()
      .from(userMetaTable)
      .where(and(eq(userMetaTable.userId, userId), eq(userMetaTable.key, 'hold_items')))
      .limit(1);

    if (!metadata || metadata.length === 0) {
      return {};
    }

    const holdItems = metadata[0].value as Record<string, any[]>;

    // If no search query, return all hold items
    if (!searchQuery || searchQuery.trim() === '') {
      return holdItems;
    }

    const searchLower = searchQuery.toLowerCase().trim();
    const filteredItems: Record<string, any[]> = {};

    // Get all products to build a product ID to name mapping
    const allProductIds = new Set<string>();
    for (const items of Object.values(holdItems)) {
      for (const item of items) {
        if (item.productId) {
          allProductIds.add(item.productId);
        }
      }
    }

    // Fetch products that are in the hold items
    const products = await db.select({
      id: productTable.id,
      name: productTable.name,
    })
      .from(productTable)
      .where(inArray(productTable.id, Array.from(allProductIds)));

    // Build product ID to name map
    const productNameMap = new Map<string, string>();
    for (const product of products) {
      productNameMap.set(product.id, product.name);
    }

    // Filter hold items based on search query
    for (const [ref, items] of Object.entries(holdItems)) {
      // Check if reference name matches
      const refMatches = ref.toLowerCase().includes(searchLower);

      // Check if any product in this hold item matches
      const productMatches = items.some(item => {
        const productName = productNameMap.get(item.productId);
        return productName && productName.toLowerCase().includes(searchLower);
      });

      // Include this hold item if either reference or product matches
      if (refMatches || productMatches) {
        filteredItems[ref] = items;
      }
    }

    return filteredItems;
  }

  // Set user metadata with merge behavior
  static async setUserMeta(userId: string, key: string, value: any, merge: boolean = false) {
    // Check if metadata with this key already exists for the user
    const existing = await db.select()
      .from(userMetaTable)
      .where(and(eq(userMetaTable.userId, userId), eq(userMetaTable.key, key)))
      .limit(1);

    let finalValue = value;

    // If merge is true and key exists, perform deep merge
    if (merge && existing.length > 0) {
      const existingValue = existing[0].value;
      finalValue = this.deepMerge(existingValue, value);
    }

    // Use transaction for upsert
    const result = await db.transaction(async (tx) => {
      if (existing.length > 0) {
        // Update existing metadata
        const [updated] = await tx.update(userMetaTable)
          .set({
            value: finalValue,
            updatedAt: getCurrentDate(),
          })
          .where(and(eq(userMetaTable.userId, userId), eq(userMetaTable.key, key)))
          .returning();

        return updated;
      } else {
        // Create new metadata
        const newMeta: NewUserMeta = {
          userId,
          key,
          value: finalValue,
        };

        const [created] = await tx.insert(userMetaTable)
          .values(newMeta)
          .returning();

        return created;
      }
    });

    return result;
  }

  // Delete user metadata by key
  static async deleteUserMeta(userId: string, key: string) {
    const existing = await db.select()
      .from(userMetaTable)
      .where(and(eq(userMetaTable.userId, userId), eq(userMetaTable.key, key)))
      .limit(1);

    if (!existing || existing.length === 0) {
      throw new AppError('User metadata not found', 404);
    }

    const [deleted] = await db.delete(userMetaTable)
      .where(and(eq(userMetaTable.userId, userId), eq(userMetaTable.key, key)))
      .returning();

    return deleted;
  }

  // Deep merge utility for JSON objects
  // Handles objects, arrays, and primitive values
  private static deepMerge(target: any, source: any): any {
    // If source is null or undefined, return target
    if (source === null || source === undefined) {
      return target;
    }

    // If target is null or undefined, return source
    if (target === null || target === undefined) {
      return source;
    }

    // If both are arrays, concatenate them
    if (Array.isArray(target) && Array.isArray(source)) {
      return [...target, ...source];
    }

    // If both are objects, merge them recursively
    if (typeof target === 'object' && typeof source === 'object' && !Array.isArray(target) && !Array.isArray(source)) {
      const result = { ...target };

      for (const key of Object.keys(source)) {
        result[key] = this.deepMerge(target[key], source[key]);
      }

      return result;
    }

    // For primitives or mismatched types, source overrides target
    return source;
  }
}
