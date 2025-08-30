import { eq } from 'drizzle-orm';
import { productCategories } from '../drizzle/schema/productCategory';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';
import { inventoryItems } from '../drizzle/schema/inventoryItem';
import { inventoryItemCategories } from '../drizzle/schema/inventoryItemCategory';
import { inventoryItemUnits } from '../drizzle/schema/inventoryItemUnit';
import { inventoryStocks } from '../drizzle/schema/inventoryStock';
import { InventoryTransaction, inventoryTransactions } from '../drizzle/schema/inventoryTransaction';
import { units as unitsTable } from '../drizzle/schema/unit';
import { outlets } from '../drizzle/schema/outet';

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

interface InventoryItemWithDetails {
  id: string;
  productName: string;
  sku: string;
  image?: string;
  supplierName?: string;
  lowStockThreshold: number;
  mainUnitId: string | null;
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
  private static async getCompleteItemDetails(itemId: string): Promise<InventoryItemWithDetails> {
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

    // Get stocks with unit suffix
    const stocks = await db
      .select({
        id: inventoryStocks.id,
        outletId: inventoryStocks.outletId,
        unitId: inventoryStocks.unitId,
        stock: inventoryStocks.stock,
        pricePerUnit: inventoryStocks.pricePerUnit,
        createdAt: inventoryStocks.createdAt,
        updatedAt: inventoryStocks.updatedAt,
        unitSuffix: unitsTable.unitSuffix
      })
      .from(inventoryStocks)
      .leftJoin(unitsTable, eq(inventoryStocks.unitId, unitsTable.id))
      .where(eq(inventoryStocks.inventoryItemId, item[0].id));

    const transactions = await db
      .select()
      .from(inventoryTransactions)
      .where(eq(inventoryTransactions.inventoryItemId, item[0].id));

    // Group stocks by outlet
    const stocksByOutlet: Record<string, OutletStockData[]> = {};
    for (const stock of stocks) {
      // Get outlet name from the outlets table
      const outletResult = await db
        .select({
          name: outlets.name
        })
        .from(outlets)
        .where(eq(outlets.id, stock.outletId!))
        .limit(1);

      const outletName = outletResult[0]?.name || `Outlet ${stock.outletId}`;

      if (!stocksByOutlet[outletName]) {
        stocksByOutlet[outletName] = [];
      }

      stocksByOutlet[outletName].push({
        stocks: {
          [stock.unitSuffix!]: {
            stock: stock.stock,
            pricePerUnit: Number(stock.pricePerUnit)
          }
        },
        createdAt: stock.createdAt,
        updatedAt: stock.updatedAt
      });
    }

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

    return {
      ...item[0],
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
    };
  }

  // Create a new inventory item with related data
  static async createInventoryItem(itemData: any, createdBy?: string): Promise<InventoryItemWithDetails> {
    const {
      productName,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnitId,
      categoryIds,
      unitIds,
      stocks
    } = itemData;

    // Start a transaction
    const result = await db.transaction(async (tx) => {
      // Create the main inventory item
      const [createdItem] = await tx.insert(inventoryItems).values({
        productName,
        sku,
        image,
        supplierName,
        lowStockThreshold,
        mainUnitId,
        createdBy: createdBy || null
      }).returning();

      if (!createdItem) {
        throw new AppError('Failed to create inventory item', 500);
      }

      // Create categories relationships
      if (categoryIds && categoryIds.length > 0) {
        const categoryRelations = categoryIds.map((categoryId: string) => ({
          inventoryItemId: createdItem.id,
          categoryId
        }));
        await tx.insert(inventoryItemCategories).values(categoryRelations);
      }

      // Create units relationships
      if (unitIds && unitIds.length > 0) {
        const unitRelations = unitIds.map((unitId: string) => ({
          inventoryItemId: createdItem.id,
          unitId
        }));
        await tx.insert(inventoryItemUnits).values(unitRelations);
      }

      // Create stocks
      if (stocks && stocks.length > 0) {
        const stockRecords = stocks.map((stock: any) => ({
          inventoryItemId: createdItem.id,
          outletId: stock.outletId,
          unitId: stock.unitId,
          stock: stock.stock,
          pricePerUnit: stock.pricePerUnit
        }));
        await tx.insert(inventoryStocks).values(stockRecords);
      }

      return createdItem;
    });

    return await this.getCompleteItemDetails(result.id);
  }

  // Get all inventory items with related data
  static async getAllInventoryItems(): Promise<InventoryItemWithDetails[]> {
    const items = await db.select().from(inventoryItems);

    const itemsWithDetails = await Promise.all(items.map(async (item) => {
      return this.getCompleteItemDetails(item.id);
    }));

    return itemsWithDetails;
  }

  // Get inventory item by ID
  static async getInventoryItemById(id: string): Promise<InventoryItemWithDetails> {
    return await this.getCompleteItemDetails(id);
  }

  // Update inventory item
  static async updateInventoryItem(id: string, itemData: Partial<InventoryItemWithDetails>): Promise<InventoryItemWithDetails> {
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
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnitId,
      categories,
      units,
      outlets: outletsData
    } = itemData;

    // Pre-fetch units and outlets to create maps
    const unitsMap = await db
      .select({ id: unitsTable.id, unitLabel: unitsTable.unitLabel })
      .from(unitsTable)
      .then(units => {
        const map: Record<string, string> = {};
        units.forEach(unit => {
          map[unit.unitLabel] = unit.id;
        });
        return map;
      });

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
      if (sku !== undefined) basicUpdateData.sku = sku;
      if (image !== undefined) basicUpdateData.image = image;
      if (supplierName !== undefined) basicUpdateData.supplierName = supplierName;
      if (lowStockThreshold !== undefined) basicUpdateData.lowStockThreshold = lowStockThreshold;
      if (mainUnitId !== undefined) basicUpdateData.mainUnitId = mainUnitId;

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

        const stockRecords: Array<typeof inventoryStocks.$inferInsert> = [];

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
            // Process each unit in the stocks object
            for (const [unitSuffix, stockInfo] of Object.entries(outletStockData.stocks)) {
              // Get unit ID by label
              const unitResult = await tx
                .select({ id: unitsTable.id })
                .from(unitsTable)
                .where(eq(unitsTable.unitSuffix, unitSuffix))
                .limit(1);

              if (unitResult.length === 0) {
                throw new AppError(`Unit with label '${unitSuffix}' not found`, 404);
              }

              const unitId = unitResult[0].id;

              stockRecords.push({
                inventoryItemId: id,
                outletId: outletId,
                unitId: unitId,
                stock: stockInfo.stock,
                pricePerUnit: String(stockInfo.pricePerUnit),
                createdAt: new Date(outletStockData.createdAt),
                updatedAt: new Date(outletStockData.updatedAt)
              });
            }
          }
        }

        // Insert all new stock records
        if (stockRecords.length > 0) {
          await tx.insert(inventoryStocks).values(stockRecords);
        }
      }
    });

    // Return complete item details
    return await this.getCompleteItemDetails(id);
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