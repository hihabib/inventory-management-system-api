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
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { customerCategories, CustomerCategory } from '../drizzle/schema/customerCategory';
import { Customer, customers } from '../drizzle/schema/customer';

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

            // Create sold items
            if (soldItemsData.length > 0) {
                const itemsWithRecordId = soldItemsData.map(item => ({
                    ...item,
                    soldRecordId: createdSoldRecord.id
                }));
                await tx.insert(soldItems).values(itemsWithRecordId);
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

    // Get a sold record by ID with all related data
    static async getSoldRecordById(id: string): Promise<{
        soldRecord: SoldRecord;
        soldItems: SoldItem[];
        soldPayments: SoldPayment[];
        customerCategory?: CustomerCategory;
        customer?: Customer | null;
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
        let customer: Customer | null = null;
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