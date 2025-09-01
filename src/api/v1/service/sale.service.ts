// src/services/sale.service.ts

import { db } from '../drizzle/db';
import {
    soldRecords,
    soldItems,
    soldPaymentInfo,
 
    NewSoldRecord,
    NewSoldItem,
    NewSoldPayment,
    SoldRecord,
    SoldItem,
    SoldPayment
} from '../drizzle/schema/sale';
import { eq, and } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { customerCategories, CustomerCategory } from '../drizzle/schema/customerCategory';
import { Customer, customers } from '../drizzle/schema/customer';
import { inventoryStocks } from '../drizzle/schema/inventoryStock';
import { inventoryItems } from '../drizzle/schema/inventoryItem';
import { units } from '../drizzle/schema/unit';

export class SaleService {
  // Create a new sold record with related items and payments
  static async createSoldRecord(
    soldRecordData: Omit<NewSoldRecord, 'id' | 'createdAt' | 'updatedAt'>,
    soldItemsData: Omit<NewSoldItem, 'id' | 'soldRecordId'>[],
    soldPaymentsData: Omit<NewSoldPayment, 'id' | 'soldRecordId'>[]
  ): Promise<SoldRecord> {
    const result = await db.transaction(async (tx) => {
      // Create the sold record
      const [createdSoldRecord] = await tx
        .insert(soldRecords)
        .values(soldRecordData)
        .returning();
      
      if (!createdSoldRecord) {
        throw new AppError('Failed to create sold record', 500);
      }
      
      // Process each sold item and update inventory stock
      for (const item of soldItemsData) {
        // Get the inventory stock record for this item and outlet
        const inventoryStock = await tx
          .select()
          .from(inventoryStocks)
          .where(
            and(
              eq(inventoryStocks.inventoryItemId, item.inventoryItemId),
              eq(inventoryStocks.outletId, soldRecordData.outletId)
            )
          )
          .limit(1);
        
        if (inventoryStock.length === 0) {
          throw new AppError(`Inventory stock not found for item ${item.inventoryItemId} in outlet ${soldRecordData.outletId}`, 404);
        }
        
        const stockRecord = inventoryStock[0];
        const stocks = stockRecord.stocks as Record<string, { stock: number; pricePerUnit: number }>;
        
        // Get the main unit information
        const inventoryItemData = await tx
          .select()
          .from(inventoryItems)
          .where(eq(inventoryItems.id, item.inventoryItemId))
          .limit(1);
        
        if (inventoryItemData.length === 0) {
          throw new AppError(`Inventory item not found for ID ${item.inventoryItemId}`, 404);
        }
        
        const mainUnitId = inventoryItemData[0].mainUnitId;
        const mainUnitData = await tx
          .select()
          .from(units)
          .where(eq(units.id, mainUnitId!))
          .limit(1);
        
        if (mainUnitData.length === 0) {
          throw new AppError(`Main unit not found for ID ${mainUnitId}`, 404);
        }
        
        const mainUnitSuffix = mainUnitData[0].unitSuffix;
        
        // Check if the sold unit exists in the stocks
        if (!stocks[item.unitSuffix]) {
          throw new AppError(`Unit ${item.unitSuffix} not found in inventory stocks`, 404);
        }
        
        // Check if the main unit exists in the stocks
        if (!stocks[mainUnitSuffix]) {
          throw new AppError(`Main unit ${mainUnitSuffix} not found in inventory stocks`, 404);
        }
        
        // Calculate conversion ratios
        const mainUnitStock = stocks[mainUnitSuffix];
        const soldUnitStock = stocks[item.unitSuffix];
        
        // Calculate the ratio between sold unit and main unit
        // This is based on the stock levels: how many main units per sold unit
        const ratioSoldToMain = mainUnitStock.stock / soldUnitStock.stock;
        
        // Calculate the equivalent quantity in main unit
        const soldQuantityInMainUnit = item.quantity * ratioSoldToMain;
        
        // Create a copy of the stocks to update
        const updatedStocks: Record<string, { stock: number; pricePerUnit: number }> = JSON.parse(JSON.stringify(stocks));
        
        // Update the sold unit stock
        updatedStocks[item.unitSuffix] = {
          ...soldUnitStock,
          stock: soldUnitStock.stock - item.quantity
        };
        
        // Update the main unit stock
        updatedStocks[mainUnitSuffix] = {
          ...mainUnitStock,
          stock: mainUnitStock.stock - soldQuantityInMainUnit
        };
        
        // Update all other units proportionally
        for (const [unitSuffix, unitStock] of Object.entries(stocks)) {
          // Skip the sold unit and main unit as they are already updated
          if (unitSuffix === item.unitSuffix || unitSuffix === mainUnitSuffix) {
            continue;
          }
          
          // Calculate the ratio between this unit and the main unit
          const ratioUnitToMain = mainUnitStock.stock / unitStock.stock;
          
          // Calculate the equivalent quantity in this unit
          const soldQuantityInThisUnit = soldQuantityInMainUnit / ratioUnitToMain;
          
          // Update the stock for this unit
          updatedStocks[unitSuffix] = {
            ...unitStock,
            stock: unitStock.stock - soldQuantityInThisUnit
          };
          
          // Check if stock is negative
          if (updatedStocks[unitSuffix].stock < 0) {
            throw new AppError(`Insufficient stock for unit ${unitSuffix}. Available: ${unitStock.stock}, Required: ${soldQuantityInThisUnit}`, 400);
          }
        }
        
        // Check if the sold unit stock is negative
        if (updatedStocks[item.unitSuffix].stock < 0) {
          throw new AppError(`Insufficient stock for unit ${item.unitSuffix}. Available: ${soldUnitStock.stock}, Required: ${item.quantity}`, 400);
        }
        
        // Check if the main unit stock is negative
        if (updatedStocks[mainUnitSuffix].stock < 0) {
          throw new AppError(`Insufficient stock for main unit ${mainUnitSuffix}. Available: ${mainUnitStock.stock}, Required: ${soldQuantityInMainUnit}`, 400);
        }
        
        // Update the inventoryStocks record
        await tx
          .update(inventoryStocks)
          .set({
            stocks: updatedStocks,
            updatedAt: new Date()
          })
          .where(eq(inventoryStocks.id, stockRecord.id));
        
        // Create the sold item
        await tx
          .insert(soldItems)
          .values({
            ...item,
            soldRecordId: createdSoldRecord.id
          });
      }
      
      // Create sold payments
      if (soldPaymentsData.length > 0) {
        const paymentsWithRecordId = soldPaymentsData.map(payment => ({
          ...payment,
          soldRecordId: createdSoldRecord.id
        }));
        await tx.insert(soldPaymentInfo).values(paymentsWithRecordId);
      }
      
      return createdSoldRecord;
    });
    
    return result;
  }

  // Get a sold record by ID with all related data, including customer category and customer
  static async getSoldRecordById(id: string): Promise<{
    soldRecord: SoldRecord;
    soldItems: SoldItem[];
    soldPayments: SoldPayment[];
    customerCategory?: CustomerCategory;
    customer?: Customer;
  } | null> {
    // Get the sold record
    const soldRecord = await db
      .select()
      .from(soldRecords)
      .where(eq(soldRecords.id, id))
      .limit(1);
    
    if (soldRecord.length === 0) {
      return null;
    }
    
    // Get customer category
    const customerCategory = await db
      .select()
      .from(customerCategories)
      .where(eq(customerCategories.id, soldRecord[0].customerCategoryId))
      .limit(1);
    
    // Get customer if it exists
    let customer: Customer | undefined = undefined;
    if (soldRecord[0].customerId) {
      const customerResult = await db
        .select()
        .from(customers)
        .where(eq(customers.id, soldRecord[0].customerId))
        .limit(1);
      if (customerResult.length > 0) {
        customer = customerResult[0];
      }
    }
    
    // Get sold items
    const items = await db
      .select()
      .from(soldItems)
      .where(eq(soldItems.soldRecordId, id));
    
    // Get sold payments
    const payments = await db
      .select()
      .from(soldPaymentInfo)
      .where(eq(soldPaymentInfo.soldRecordId, id));
    
    return {
      soldRecord: soldRecord[0],
      soldItems: items,
      soldPayments: payments,
      customerCategory: customerCategory[0],
      customer
    };
  }

  // Get all sold records for a user
  static async getSoldRecordsByUser(userId: string): Promise<SoldRecord[]> {
    return db
      .select()
      .from(soldRecords)
      .where(eq(soldRecords.userId, userId));
  }

  // Delete a sold record by ID (will also delete related items and payments due to cascade)
  static async deleteSoldRecord(id: string): Promise<void> {
    const result = await db
      .delete(soldRecords)
      .where(eq(soldRecords.id, id))
      .returning({ id: soldRecords.id });
    
    if (result.length === 0) {
      throw new AppError('Sold record not found', 404);
    }
  }
}