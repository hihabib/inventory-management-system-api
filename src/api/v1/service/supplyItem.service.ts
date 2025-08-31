import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';
import { supplyItems } from '../drizzle/schema/supplyItem';
import { supplyItemCategories } from '../drizzle/schema/supplyItemCategory';
import { supplyItemUnits } from '../drizzle/schema/supplyItemUnit';
import { supplyStocks } from '../drizzle/schema/supplyStock';
import { units as unitsTable } from '../drizzle/schema/unit';
import { productionHouses } from '../drizzle/schema/productionHouse';
import { supplyCategories } from '../drizzle/schema/supplyCategory';

// Type definitions
interface StockByUnit {
  stock: number;
  pricePerUnit: number;
}

interface ProductionHouseStockData {
  stocks: Record<string, StockByUnit>;
  createdAt: Date;
  updatedAt: Date;
}

interface SupplyItemWithDetails {
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
  productionHouses: Record<string, ProductionHouseStockData[]>;
}

export class SupplyItemService {
  // Helper function to get complete item details
  private static async getCompleteItemDetails(itemId: string): Promise<SupplyItemWithDetails> {
    const item = await db
      .select()
      .from(supplyItems)
      .where(eq(supplyItems.id, itemId))
      .limit(1);
      
    if (item.length === 0) {
      throw new AppError('Supply item not found', 404);
    }
    
    // Get related data
    const categories = await db
      .select({
        id: supplyCategories.id,
        categoryName: supplyCategories.categoryName,
        categorySlug: supplyCategories.categorySlug
      })
      .from(supplyItemCategories)
      .leftJoin(supplyCategories, eq(supplyItemCategories.categoryId, supplyCategories.id))
      .where(eq(supplyItemCategories.supplyItemId, item[0].id));
      
    const itemUnits = await db
      .select({
        id: unitsTable.id,
        unitLabel: unitsTable.unitLabel,
        unitSuffix: unitsTable.unitSuffix
      })
      .from(supplyItemUnits)
      .leftJoin(unitsTable, eq(supplyItemUnits.unitId, unitsTable.id))
      .where(eq(supplyItemUnits.supplyItemId, item[0].id));
      
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
        id: supplyStocks.id,
        productionHouseId: supplyStocks.productionHouseId,
        unitId: supplyStocks.unitId,
        stock: supplyStocks.stock,
        pricePerUnit: supplyStocks.pricePerUnit,
        createdAt: supplyStocks.createdAt,
        updatedAt: supplyStocks.updatedAt,
        unitSuffix: unitsTable.unitSuffix
      })
      .from(supplyStocks)
      .leftJoin(unitsTable, eq(supplyStocks.unitId, unitsTable.id))
      .where(eq(supplyStocks.supplyItemId, item[0].id));
      
    // Group stocks by production house
    const stocksByProductionHouse: Record<string, ProductionHouseStockData[]> = {};
    for (const stock of stocks) {
      // Get production house name from the productionHouses table
      const productionHouseResult = await db
        .select({
          name: productionHouses.name
        })
        .from(productionHouses)
        .where(eq(productionHouses.id, stock.productionHouseId!))
        .limit(1);
        
      const productionHouseName = productionHouseResult[0]?.name || `Production House ${stock.productionHouseId}`;
      
      if (!stocksByProductionHouse[productionHouseName]) {
        stocksByProductionHouse[productionHouseName] = [];
      }
      
      stocksByProductionHouse[productionHouseName].push({
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
      productionHouses: stocksByProductionHouse
    };
  }
  
  // Create a new supply item with related data
  static async createSupplyItem(itemData: any, createdBy?: string): Promise<SupplyItemWithDetails> {
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
      // Create the main supply item
      const [createdItem] = await tx.insert(supplyItems).values({
        productName,
        sku,
        image,
        supplierName,
        lowStockThreshold,
        mainUnitId,
        createdBy: createdBy || null
      }).returning();
      
      if (!createdItem) {
        throw new AppError('Failed to create supply item', 500);
      }
      
      // Create categories relationships
      if (categoryIds && categoryIds.length > 0) {
        const categoryRelations = categoryIds.map((categoryId: string) => ({
          supplyItemId: createdItem.id,
          categoryId
        }));
        await tx.insert(supplyItemCategories).values(categoryRelations);
      }
      
      // Create units relationships
      if (unitIds && unitIds.length > 0) {
        const unitRelations = unitIds.map((unitId: string) => ({
          supplyItemId: createdItem.id,
          unitId
        }));
        await tx.insert(supplyItemUnits).values(unitRelations);
      }
      
      // Create stocks
      if (stocks && stocks.length > 0) {
        const stockRecords = stocks.map((stock: any) => ({
          supplyItemId: createdItem.id,
          productionHouseId: stock.productionHouseId,
          unitId: stock.unitId,
          stock: stock.stock,
          pricePerUnit: stock.pricePerUnit
        }));
        await tx.insert(supplyStocks).values(stockRecords);
      }
      
      return createdItem;
    });
    
    return await this.getCompleteItemDetails(result.id);
  }
  
  // Get all supply items with related data
  static async getAllSupplyItems(): Promise<SupplyItemWithDetails[]> {
    const items = await db.select().from(supplyItems);
    const itemsWithDetails = await Promise.all(items.map(async (item) => {
      return this.getCompleteItemDetails(item.id);
    }));
    return itemsWithDetails;
  }
  
  // Get supply item by ID
  static async getSupplyItemById(id: string): Promise<SupplyItemWithDetails> {
    return await this.getCompleteItemDetails(id);
  }
  
  // Update supply item
  static async updateSupplyItem(id: string, itemData: Partial<SupplyItemWithDetails>): Promise<SupplyItemWithDetails> {
    // Check if item exists
    const existingItem = await db
      .select()
      .from(supplyItems)
      .where(eq(supplyItems.id, id))
      .limit(1);
      
    if (existingItem.length === 0) {
      throw new AppError('Supply item not found', 404);
    }
    
    // Extract basic fields from SupplyItemWithDetails
    const {
      productName,
      sku,
      image,
      supplierName,
      lowStockThreshold,
      mainUnitId,
      categories,
      units,
      productionHouses: productionHousesData
    } = itemData;
    
    // Start a transaction to handle all updates
    await db.transaction(async (tx) => {
      // Update basic item fields
      const basicUpdateData: Partial<typeof supplyItems.$inferInsert> = {};
      if (productName !== undefined) basicUpdateData.productName = productName;
      if (sku !== undefined) basicUpdateData.sku = sku;
      if (image !== undefined) basicUpdateData.image = image;
      if (supplierName !== undefined) basicUpdateData.supplierName = supplierName;
      if (lowStockThreshold !== undefined) basicUpdateData.lowStockThreshold = lowStockThreshold;
      if (mainUnitId !== undefined) basicUpdateData.mainUnitId = mainUnitId;
      basicUpdateData.updatedAt = new Date();
      
      if (Object.keys(basicUpdateData).length > 0) {
        await tx
          .update(supplyItems)
          .set(basicUpdateData)
          .where(eq(supplyItems.id, id));
      }
      
      // Handle category updates
      if (categories !== undefined) {
        // Replace all categories
        await tx.delete(supplyItemCategories).where(eq(supplyItemCategories.supplyItemId, id));
        if (categories.length > 0) {
          const categoryRelations = categories.map((category) => ({
            supplyItemId: id,
            categoryId: category.id
          }));
          await tx.insert(supplyItemCategories).values(categoryRelations);
        }
      }
      
      // Handle unit updates
      if (units !== undefined) {
        // Replace all units
        await tx.delete(supplyItemUnits).where(eq(supplyItemUnits.supplyItemId, id));
        if (units.length > 0) {
          const unitRelations = units.map((unit) => ({
            supplyItemId: id,
            unitId: unit.id
          }));
          await tx.insert(supplyItemUnits).values(unitRelations);
        }
      }
      
      // Handle stock updates from production houses structure
      if (productionHousesData) {
        // Delete all existing stocks for this supply item
        await tx.delete(supplyStocks).where(eq(supplyStocks.supplyItemId, id));
        
        const stockRecords: Array<typeof supplyStocks.$inferInsert> = [];
        
        // Process each production house and its stocks
        for (const [productionHouseName, productionHouseStockDataArray] of Object.entries(productionHousesData)) {
          // Get production house ID by name
          const productionHouseResult = await tx
            .select({ id: productionHouses.id })
            .from(productionHouses)
            .where(eq(productionHouses.name, productionHouseName))
            .limit(1);
            
          if (productionHouseResult.length === 0) {
            throw new AppError(`Production house with name '${productionHouseName}' not found`, 404);
          }
          
          const productionHouseId = productionHouseResult[0].id;
          
          // Process each stock data array for this production house
          for (const productionHouseStockData of productionHouseStockDataArray) {
            // Process each unit in the stocks object
            for (const [unitSuffix, stockInfo] of Object.entries(productionHouseStockData.stocks)) {
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
                supplyItemId: id,
                productionHouseId: productionHouseId,
                unitId: unitId,
                stock: stockInfo.stock,
                pricePerUnit: stockInfo.pricePerUnit,
                createdAt: new Date(productionHouseStockData.createdAt),
                updatedAt: new Date(productionHouseStockData.updatedAt)
              });
            }
          }
        }
        
        // Insert all new stock records
        if (stockRecords.length > 0) {
          await tx.insert(supplyStocks).values(stockRecords);
        }
      }
    });
    
    // Return complete item details
    return await this.getCompleteItemDetails(id);
  }
  
  // Delete supply item and related data
  static async deleteSupplyItem(id: string): Promise<{ success: boolean; message: string }> {
    // Check if item exists
    const existingItem = await db
      .select()
      .from(supplyItems)
      .where(eq(supplyItems.id, id))
      .limit(1);
      
    if (existingItem.length === 0) {
      throw new AppError('Supply item not found', 404);
    }
    
    // Delete the item (cascade will handle related data)
    await db.delete(supplyItems).where(eq(supplyItems.id, id));
    
    return { success: true, message: 'Supply item deleted successfully' };
  }
}