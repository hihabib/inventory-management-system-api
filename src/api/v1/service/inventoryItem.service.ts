import { and, eq } from 'drizzle-orm';
import { productCategories } from '../drizzle/schema/productCategory';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';
import { inventoryItems } from '../drizzle/schema/inventoryItem';
import { inventoryItemCategories } from '../drizzle/schema/inventoryItemCategory';
import { inventoryItemUnits } from '../drizzle/schema/inventoryItemUnit';
import { inventoryStocks, NewInventoryStock } from '../drizzle/schema/inventoryStock';
import { InventoryTransaction, inventoryTransactions } from '../drizzle/schema/inventoryTransaction';
import { units as unitsTable } from '../drizzle/schema/unit';
import { outlets } from '../drizzle/schema/outet';
import { User } from '../drizzle/schema/user';

// Type definitions
interface StockByUnit {
  stock: number;
  pricePerUnit: number;
}

interface OutletStockData {
  stocks: Record<string, StockByUnit>;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryItemWithDetails {
  id: string;
  productName: string;
  productNameBengali: string;
  sku: string;
  image?: string;
  supplierName?: string;
  lowStockThreshold: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  categories: {
    id: string;
    categoryName: string;
    categorySlug: string;
  }[];
  units: {
    id: string;
    unitLabel: string;
    unitSuffix: string;
  }[];
  mainUnit: {
    id: string;
    unitLabel: string;
    unitSuffix: string;
  } | null;
  outlets: Record<string, OutletStockData[]>;
  transactions: {
    orders: any[];
    returns: any[];
  };
}

export class InventoryItemService {
  // Helper function to get complete item details
  private static async getCompleteItemDetails(itemId: string, user?: Partial<User>): Promise<InventoryItemWithDetails | null> {
    const item = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, itemId))
      .limit(1);
    if (item.length === 0) {
      throw new AppError('Inventory item not found', 404);
    }
    // Get related data
    const categories = await db
      .select({
        id: productCategories.id,
        categoryName: productCategories.categoryName,
        categorySlug: productCategories.categorySlug
      })
      .from(inventoryItemCategories)
      .leftJoin(productCategories, eq(inventoryItemCategories.categoryId, productCategories.id))
      .where(eq(inventoryItemCategories.inventoryItemId, item[0].id));
    const itemUnits = await db
      .select({
        id: unitsTable.id,
        unitLabel: unitsTable.unitLabel,
        unitSuffix: unitsTable.unitSuffix
      })
      .from(inventoryItemUnits)
      .leftJoin(unitsTable, eq(inventoryItemUnits.unitId, unitsTable.id))
      .where(eq(inventoryItemUnits.inventoryItemId, item[0].id));
    // Get main unit
    let mainUnit = null;
    if (item[0].mainUnitId) {
      const mainUnitResult = await db
        .select({
          id: unitsTable.id,
          unitLabel: unitsTable.unitLabel,
          unitSuffix: unitsTable.unitSuffix
        })
        .from(unitsTable)
        .where(eq(unitsTable.id, item[0].mainUnitId))
        .limit(1);
      if (mainUnitResult.length > 0) {
        mainUnit = mainUnitResult[0];
      }
    }
    const { id: userId, role: userRole } = user || {};
    // Determine if we should filter by user
    const shouldFilterByUser = userRole === 'outlet' && userId;
    // Get stocks with outlet information
    let stocks;
    if (shouldFilterByUser) {
      // Filter by inventory item ID and user ID
      stocks = await db
        .select({
          id: inventoryStocks.id,
          outletId: inventoryStocks.outletId,
          stocks: inventoryStocks.stocks, // Get the entire stocks object
          createdAt: inventoryStocks.createdAt,
          updatedAt: inventoryStocks.updatedAt,
          outletName: outlets.name
        })
        .from(inventoryStocks)
        .leftJoin(outlets, eq(inventoryStocks.outletId, outlets.id))
        .where(and(
          eq(inventoryStocks.inventoryItemId, item[0].id),
          eq(outlets.assignedTo, userId)
        ));
    } else {
      // Only filter by inventory item ID
      stocks = await db
        .select({
          id: inventoryStocks.id,
          outletId: inventoryStocks.outletId,
          stocks: inventoryStocks.stocks, // Get the entire stocks object
          createdAt: inventoryStocks.createdAt,
          updatedAt: inventoryStocks.updatedAt,
          outletName: outlets.name
        })
        .from(inventoryStocks)
        .leftJoin(outlets, eq(inventoryStocks.outletId, outlets.id))
        .where(eq(inventoryStocks.inventoryItemId, item[0].id));
    }
    // Group stocks by outlet
    const stocksByOutlet: Record<string, OutletStockData[]> = {};
    for (const stock of stocks) {
      // Use outlet name from the query result or fallback
      const outletName = stock.outletName || `Outlet ${stock.outletId}`;
      if (!stocksByOutlet[outletName]) {
        stocksByOutlet[outletName] = [];
      }

      // Cast the stocks field to the expected type
      const stocksData = stock.stocks as Record<string, StockByUnit>;

      // Add the outlet stock data
      stocksByOutlet[outletName].push({
        stocks: stocksData,
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt
      });
    }
    const transactions = await db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.inventoryItemId, item[0].id));
    // Group transactions by type
    const transactionsByType = {
      orders: [] as InventoryTransaction[],
      returns: [] as InventoryTransaction[]
    };
    for (const transaction of transactions) {
      if (transaction.transactionType === 'order') {
        transactionsByType.orders.push(transaction);
      } else if (transaction.transactionType === 'return') {
        transactionsByType.returns.push(transaction);
      }
    }
    return Object.keys(stocksByOutlet).length > 0 ? {
      ...item[0],
      productNameBengali: item[0].productNameBengali === null ? '' : item[0].productNameBengali,
      image: item[0].image === null ? undefined : item[0].image,
      supplierName: item[0].supplierName === null ? undefined : item[0].supplierName,
      lowStockThreshold: item[0].lowStockThreshold === null ? 0 : item[0].lowStockThreshold,
      categories: categories.filter((category): category is { id: string; categoryName: string; categorySlug: string; } =>
        category.id !== null &&
        category.categoryName !== null &&
        category.categorySlug !== null
      ),
      units: itemUnits.filter((unit): unit is { id: string; unitLabel: string; unitSuffix: string; } =>
        unit.id !== null &&
        unit.unitLabel !== null &&
        unit.unitSuffix !== null
      ),
      mainUnit,
      outlets: stocksByOutlet,
      transactions: transactionsByType
    } : null;
  }

  // Create a new inventory item with related data
  static async createInventoryItem(itemData: Partial<InventoryItemWithDetails>, createdBy?: string): Promise<InventoryItemWithDetails | null> {
    const {
      productName,
      productNameBengali,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnit,
      categories,
      units,
      outlets: outletsData
    } = itemData;

    // Validate required fields
    if (!productName) {
      throw new AppError('Product name is required', 400);
    }
    if (!sku) {
      throw new AppError('SKU is required', 400);
    }
    if (!Array.isArray(categories) || categories.length === 0) {
      throw new AppError('At least one category is required', 400);
    }
    if (!Array.isArray(units) || units.length === 0) {
      throw new AppError('At least one unit is required', 400);
    }
    if (!mainUnit || typeof mainUnit.id !== 'string') {
      throw new AppError('Main unit is required and must have a valid id', 400);
    }
    if (!outletsData || typeof outletsData !== 'object' || Object.keys(outletsData).length === 0) {
      throw new AppError('At least one outlet with stock data is required', 400);
    }
    for (const [outletName, outletStockDataArray] of Object.entries(outletsData)) {
      if (!Array.isArray(outletStockDataArray) || outletStockDataArray.length === 0) {
        throw new AppError(`Outlet '${outletName}' must have at least one stock entry`, 400);
      }
      for (const outletStockData of outletStockDataArray) {
        if (
          !outletStockData.stocks ||
          typeof outletStockData.stocks !== 'object' ||
          Object.keys(outletStockData.stocks).length === 0
        ) {
          throw new AppError(`Stock data for outlet '${outletName}' is invalid or empty`, 400);
        }
        if (!outletStockData.createdAt) {
          throw new AppError(`createdAt is required for outlet '${outletName}'`, 400);
        }
        if (!outletStockData.updatedAt) {
          throw new AppError(`updatedAt is required for outlet '${outletName}'`, 400);
        }
      }
    }
    const existedSkuInventoryItem = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku)).limit(1);
    if (existedSkuInventoryItem[0]?.sku?.length) {
      throw new AppError('SKU already exists for another inventory item', 400);
    }


    // Start a transaction
    const result = await db.transaction(async (tx) => {
      // Create the main inventory item
      const [createdItem] = await tx.insert(inventoryItems).values({
        productName,
        productNameBengali,
        sku,
        image: image || null,
        supplierName: supplierName || null,
        lowStockThreshold: lowStockThreshold || 0,
        mainUnitId: mainUnit?.id || null,
        createdBy: createdBy || null
      }).returning();

      if (!createdItem) {
        throw new AppError('Failed to create inventory item', 500);
      }

      // Create categories relationships
      if (categories && categories.length > 0) {
        const categoryRelations = categories.map((category) => ({
          inventoryItemId: createdItem.id,
          categoryId: category.id
        }));
        await tx.insert(inventoryItemCategories).values(categoryRelations);
      }

      // Create units relationships
      if (units && units.length > 0) {
        const unitRelations = units.map((unit) => ({
          inventoryItemId: createdItem.id,
          unitId: unit.id
        }));
        await tx.insert(inventoryItemUnits).values(unitRelations);
      }

      // Create stocks from outlets structure
      if (outletsData && Object.keys(outletsData).length > 0) {
        const stockRecords: NewInventoryStock[] = [];

        // Process each outlet by name
        for (const [outletName, outletStockDataArray] of Object.entries(outletsData)) {
          // Find outlet by name in the database
          const outletResult = await tx
            .select({ id: outlets.id })
            .from(outlets)
            .where(eq(outlets.name, outletName))
            .limit(1);

          if (outletResult.length === 0) {
            throw new AppError(`Outlet with name '${outletName}' not found`, 404);
          }

          const outletId = outletResult[0].id;

          // Process each stock data entry for this outlet
          for (const outletStockData of outletStockDataArray) {
            // Validate that stocks object exists and has entries
            if (!outletStockData.stocks || Object.keys(outletStockData.stocks).length === 0) {
              throw new AppError(`No stock data provided for outlet '${outletName}'`, 400);
            }

            // Convert and validate dates
            const createdAt = outletStockData.createdAt instanceof Date
              ? outletStockData.createdAt
              : new Date(outletStockData.createdAt);

            const updatedAt = outletStockData.updatedAt instanceof Date
              ? outletStockData.updatedAt
              : new Date(outletStockData.updatedAt);

            if (isNaN(createdAt.getTime())) {
              throw new AppError(`Invalid createdAt date for outlet '${outletName}'`, 400);
            }

            if (isNaN(updatedAt.getTime())) {
              throw new AppError(`Invalid updatedAt date for outlet '${outletName}'`, 400);
            }

            // Create a single stock record for this outlet with all units
            stockRecords.push({
              inventoryItemId: createdItem.id,
              outletId,
              stocks: outletStockData.stocks, // Store the entire stocks object as JSONB
              createdAt,
              updatedAt
            });
          }
        }

        // Insert all stock records
        if (stockRecords.length > 0) {
          await tx.insert(inventoryStocks).values(stockRecords);
        }
      }

      return createdItem;
    });

    // Return complete item details
    return await this.getCompleteItemDetails(result.id);
  }

  // Get all inventory items with related data
  static async getAllInventoryItems(user?: Partial<User>): Promise<InventoryItemWithDetails[]> {
    const items = await db.select().from(inventoryItems);

    const itemsWithDetails = await Promise.all(items.map(async (item) => {
      return this.getCompleteItemDetails(item.id, user);
    }));

    return itemsWithDetails.filter(item => item !== null);
  }


  // Get inventory item by ID
  static async getInventoryItemById(id: string): Promise<InventoryItemWithDetails | null> {
    return await this.getCompleteItemDetails(id);
  }

  // Update inventory item
  static async updateInventoryItem(id: string, itemData: Partial<InventoryItemWithDetails>): Promise<InventoryItemWithDetails | null> {
    // Check if item exists
    const existingItem = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);
    if (existingItem.length === 0) {
      throw new AppError('Inventory item not found', 404);
    }

    // Extract basic fields from InventoryItemWithDetails
    const {
      productName,
      productNameBengali,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnit,
      categories,
      units,
      outlets: outletsData
    } = itemData;

    if (sku) {
      const existedSkuInventoryItem = await db.select().from(inventoryItems).where(eq(inventoryItems.sku, sku!)).limit(1);
      if (existedSkuInventoryItem[0] && (existedSkuInventoryItem[0].sku !== existingItem[0].sku)) {
        throw new AppError('SKU already exists for another inventory item', 400);
      }
    }

    // Pre-fetch outlets to create maps (units map is no longer needed for stocks)
    const outletsMap = await db
      .select({ id: outlets.id, name: outlets.name })
      .from(outlets)
      .then(outlets => {
        const map: Record<string, string> = {};
        outlets.forEach(outlet => {
          map[outlet.name] = outlet.id;
        });
        return map;
      });

    // Start a transaction to handle all updates
    await db.transaction(async (tx) => {
      // Update basic item fields
      const basicUpdateData: Partial<typeof inventoryItems.$inferInsert> = {};
      if (productName !== undefined) basicUpdateData.productName = productName;
      if (productNameBengali !== undefined) basicUpdateData.productNameBengali = productNameBengali;
      if (sku !== undefined) basicUpdateData.sku = sku;
      if (image !== undefined) basicUpdateData.image = image;
      if (supplierName !== undefined) basicUpdateData.supplierName = supplierName;
      if (lowStockThreshold !== undefined) basicUpdateData.lowStockThreshold = lowStockThreshold;
      // Fixed: Extract id from mainUnit object
      if (mainUnit !== undefined) basicUpdateData.mainUnitId = mainUnit?.id || null;
      basicUpdateData.updatedAt = new Date();

      if (Object.keys(basicUpdateData).length > 0) {
        await tx
          .update(inventoryItems)
          .set(basicUpdateData)
          .where(eq(inventoryItems.id, id));
      }

      // Handle category updates
      if (categories !== undefined) {
        // Replace all categories
        await tx.delete(inventoryItemCategories).where(eq(inventoryItemCategories.inventoryItemId, id));
        if (categories.length > 0) {
          const categoryRelations = categories.map((category) => ({
            inventoryItemId: id,
            categoryId: category.id
          }));
          await tx.insert(inventoryItemCategories).values(categoryRelations);
        }
      }

      // Handle unit updates
      if (units !== undefined) {
        // Replace all units
        await tx.delete(inventoryItemUnits).where(eq(inventoryItemUnits.inventoryItemId, id));
        if (units.length > 0) {
          const unitRelations = units.map((unit) => ({
            inventoryItemId: id,
            unitId: unit.id
          }));
          await tx.insert(inventoryItemUnits).values(unitRelations);
        }
      }

      // Handle stock updates from outlets structure
      if (outletsData) {
        // Delete all existing stocks for this inventory item
        await tx.delete(inventoryStocks).where(eq(inventoryStocks.inventoryItemId, id));
        const stockRecords: NewInventoryStock[] = [];

        // Process each outlet and its stocks
        for (const [outletName, outletStockDataArray] of Object.entries(outletsData)) {
          // Get outlet ID by name
          const outletResult = await tx
            .select({ id: outlets.id })
            .from(outlets)
            .where(eq(outlets.name, outletName))
            .limit(1);

          if (outletResult.length === 0) {
            throw new AppError(`Outlet with name '${outletName}' not found`, 404);
          }

          const outletId = outletResult[0].id;

          // Process each stock data array for this outlet
          for (const outletStockData of outletStockDataArray) {
            // Validate that stocks object exists and has entries
            if (!outletStockData.stocks || Object.keys(outletStockData.stocks).length === 0) {
              throw new AppError(`No stock data provided for outlet '${outletName}'`, 400);
            }

            // Convert and validate dates
            const createdAt = outletStockData.createdAt instanceof Date
              ? outletStockData.createdAt
              : new Date(outletStockData.createdAt);

            const updatedAt = outletStockData.updatedAt instanceof Date
              ? outletStockData.updatedAt
              : new Date(outletStockData.updatedAt);

            if (isNaN(createdAt.getTime())) {
              throw new AppError(`Invalid createdAt date for outlet '${outletName}'`, 400);
            }

            if (isNaN(updatedAt.getTime())) {
              throw new AppError(`Invalid updatedAt date for outlet '${outletName}'`, 400);
            }

            // Create a single stock record for this outlet with all units
            stockRecords.push({
              inventoryItemId: id,
              outletId: outletId,
              stocks: outletStockData.stocks, // Store the entire stocks object as JSONB
              createdAt,
              updatedAt
            });
          }
        }

        // Insert all new stock records
        if (stockRecords.length > 0) {
          await tx.insert(inventoryStocks).values(stockRecords);
        }
      }
    });

    // Return complete item details
    return this.getCompleteItemDetails(id);
  }

  // Delete inventory item and related data
  static async deleteInventoryItem(id: string): Promise<{ success: boolean; message: string }> {
    // Check if item exists
    const existingItem = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    if (existingItem.length === 0) {
      throw new AppError('Inventory item not found', 404);
    }

    // Delete the item (cascade will handle related data)
    await db.delete(inventoryItems).where(eq(inventoryItems.id, id));

    return { success: true, message: 'Inventory item deleted successfully' };
  }
}