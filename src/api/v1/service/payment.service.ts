import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { saleTable } from "../drizzle/schema/sale";
import { FilterOptions, PaginationOptions, filterWithPaginate } from '../utils/filterWithPaginate';

export class PaymentService {
    static async getPayments(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        const result = await filterWithPaginate(paymentTable, {
            pagination,
            filter,
            orderBy: desc(paymentTable.createdAt),
            joins: [
                {
                    table: paymentSaleTable,
                    alias: 'paymentSale',
                    condition: eq(paymentTable.id, paymentSaleTable.paymentId),
                    type: 'left'
                },
                {
                    table: saleTable,
                    alias: 'sale',
                    condition: eq(paymentSaleTable.saleId, saleTable.id),
                    type: 'left'
                }
            ],
            select: {
                // Payment fields
                id: paymentTable.id,
                createdAt: paymentTable.createdAt,
                updatedAt: paymentTable.updatedAt,
                createdBy: paymentTable.createdBy,
                maintainsId: paymentTable.maintainsId,
                payments: paymentTable.payments,
                totalAmount: paymentTable.totalAmount,
                customerDueId: paymentTable.customerDueId,
                // Sale fields
                saleId: saleTable.id,
                saleCreatedAt: saleTable.createdAt,
                saleUpdatedAt: saleTable.updatedAt,
                saleCreatedBy: saleTable.createdBy,
                saleMaintainsId: saleTable.maintainsId,
                customerCategoryId: saleTable.customerCategoryId,
                customerId: saleTable.customerId,
                productId: saleTable.productId,
                productName: saleTable.productName,
                discountType: saleTable.discountType,
                discountAmount: saleTable.discountAmount,
                discountNote: saleTable.discountNote,
                saleQuantity: saleTable.saleQuantity,
                saleAmount: saleTable.saleAmount,
                pricePerUnit: saleTable.pricePerUnit,
                unit: saleTable.unit
            }
        });

        // Group sales by payment ID
        const paymentsMap = new Map();

        result.list.forEach((row: any) => {
            const paymentId = row.id;

            if (!paymentsMap.has(paymentId)) {
                paymentsMap.set(paymentId, {
                    id: row.id,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    createdBy: row.createdBy,
                    maintainsId: row.maintainsId,
                    payments: row.payments,
                    totalAmount: row.totalAmount,
                    customerDueId: row.customerDueId,
                    sales: []
                });
            }

            // Add sale data if exists
            if (row.saleId) {
                paymentsMap.get(paymentId).sales.push({
                    id: row.saleId,
                    createdAt: row.saleCreatedAt,
                    updatedAt: row.saleUpdatedAt,
                    createdBy: row.saleCreatedBy,
                    maintainsId: row.saleMaintainsId,
                    customerCategoryId: row.customerCategoryId,
                    customerId: row.customerId,
                    productId: row.productId,
                    productName: row.productName,
                    discountType: row.discountType,
                    discountAmount: row.discountAmount,
                    discountNote: row.discountNote,
                    saleQuantity: row.saleQuantity,
                    saleAmount: row.saleAmount,
                    pricePerUnit: row.pricePerUnit,
                    unit: row.unit
                });
            }
        });

        return {
            list: Array.from(paymentsMap.values()),
            pagination: result.pagination
        };
    }

    static async getPaymentById(id: number) {
        const [payment] = await db.select().from(paymentTable).where(eq(paymentTable.id, id));
        return payment;
    }
}