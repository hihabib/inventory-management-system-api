import { desc, eq, or, like, sql, inArray } from "drizzle-orm";
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
        const { page = 1, limit = 10 } = pagination;
        
        // Handle search functionality
        let searchPaymentIds: number[] | null = null;
        if (filter.search && filter.search.length > 0) {
            const searchTerm = filter.search[0].toString().toLowerCase();
            
            // Search for payments that match the criteria
            const searchResults = await db
                .selectDistinct({ id: paymentTable.id })
                .from(paymentTable)
                .leftJoin(paymentSaleTable, eq(paymentTable.id, paymentSaleTable.paymentId))
                .leftJoin(saleTable, eq(paymentSaleTable.saleId, saleTable.id))
                .where(
                    or(
                        // Search in payment ID (convert to string for partial matching)
                        like(sql`CAST(${paymentTable.id} AS TEXT)`, `%${searchTerm}%`),
                        // Search in total amount (convert to string for partial matching)
                        like(sql`CAST(${paymentTable.totalAmount} AS TEXT)`, `%${searchTerm}%`),
                        // Search in product names from sales
                        like(sql`LOWER(${saleTable.productName})`, `%${searchTerm}%`)
                    )
                );
            
            searchPaymentIds = searchResults.map(result => result.id);
            
            // If no payments match the search, return empty result
            if (searchPaymentIds.length === 0) {
                return {
                    list: [],
                    pagination: {
                        page,
                        limit,
                        totalPages: 0,
                        totalCount: 0
                    }
                };
            }
        }
        
        // Create filter object for the main query
        const mainFilter = { ...filter };
        delete mainFilter.search; // Remove search from filter as we handle it separately
        
        // Add search payment IDs to filter if search was performed
        if (searchPaymentIds !== null) {
            mainFilter.id = searchPaymentIds; // filterWithPaginate expects arrays for inArray operations
        }
        
        // First, get the unique payment IDs with pagination
        const paymentIdsResult = await filterWithPaginate(paymentTable, {
            pagination,
            filter: mainFilter,
            orderBy: desc(paymentTable.createdAt),
            select: {
                id: paymentTable.id,
                createdAt: paymentTable.createdAt,
                updatedAt: paymentTable.updatedAt,
                createdBy: paymentTable.createdBy,
                maintainsId: paymentTable.maintainsId,
                payments: paymentTable.payments,
                totalAmount: paymentTable.totalAmount,
                customerDueId: paymentTable.customerDueId,
            }
        });

        // Extract payment IDs from the paginated result
        const paymentIds = paymentIdsResult.list.map((payment: any) => payment.id);

        if (paymentIds.length === 0) {
            return {
                list: [],
                pagination: paymentIdsResult.pagination
            };
        }

        // Now get the full data with sales for these specific payment IDs
        const fullDataResult = await filterWithPaginate(paymentTable, {
            pagination: { page: 1, limit: 1000 }, // Get all data for the selected payments
            filter: { id: paymentIds }, // Filter by the paginated payment IDs
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

        fullDataResult.list.forEach((row: any) => {
            const paymentId = row.id;

            if (!paymentsMap.has(paymentId)) {
                paymentsMap.set(paymentId, {
                    id: row.id,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    createdBy: row.createdBy,
                    maintainsId: row.maintainsId,
                    payments: row.payments,
                    totalAmount: Number(row.totalAmount.toFixed(2)),
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
                    saleQuantity: Number(row.saleQuantity.toFixed(3)),
                    saleAmount: Number(row.saleAmount.toFixed(2)),
                    pricePerUnit: Number(row.pricePerUnit.toFixed(2)),
                    unit: row.unit
                });
            }
        });

        // Ensure the order matches the original pagination order
        const orderedPayments = paymentIds.map(id => paymentsMap.get(id)).filter(Boolean);

        return {
            list: orderedPayments,
            pagination: paymentIdsResult.pagination // Use the pagination from the first query
        };
    }

    static async getPaymentById(id: number) {
        const [payment] = await db.select().from(paymentTable).where(eq(paymentTable.id, id));
        if (payment) {
            return {
                ...payment,
                totalAmount: Number(payment.totalAmount.toFixed(2))
            };
        }
        return payment;
    }
}