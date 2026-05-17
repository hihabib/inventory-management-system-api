import { eq, sql, inArray, asc, and, gte, lte, or, notInArray, isNotNull } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerDueTable, NewCustomerDue } from "../drizzle/schema/customerDue";
import { userTable } from "../drizzle/schema/user";
import { customerTable } from "../drizzle/schema/customer";
import { maintainsTable } from "../drizzle/schema/maintains";
import { customerDueUpdatesTable } from "../drizzle/schema/customerDueUpdates";
import { paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { saleTable } from "../drizzle/schema/sale";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";
import { AppError } from "../utils/AppError";
import { getSummary } from "../utils/summary";

export class CustomerDueService {
    static async createCustomerDue(customerDueData: NewCustomerDue) {
        const [createdCustomerDue] = await db.insert(customerDueTable).values({
            ...customerDueData,
            createdAt: getCurrentDate(),
            updatedAt: getCurrentDate()
        }).returning();
        return createdCustomerDue;
    }

    static async updateCustomerDue(id: string, customerDueData: Partial<NewCustomerDue>, updatedBy: string, isReplacement: boolean = false, isDiscount: boolean = false) {
        const updatedCustomerDue = await db.transaction(async (tx) => {
            // Check if customer due exists
            const existingCustomerDue = await tx.select().from(customerDueTable).where(eq(customerDueTable.id, id));
            if (existingCustomerDue.length === 0) {
                throw new AppError('Customer due record not found', 404);
            }

            const prevPaidAmount = Number(existingCustomerDue[0].paidAmount ?? 0);
            const prevDiscountAmount = Number(existingCustomerDue[0].discountAmount ?? 0);

            // The request may carry both a new paid amount AND a discount increment in the
            // same call. `discountAmount` in the body is always treated as the *increment*
            // to add to the existing discount (kept for backward compatibility with the
            // previous "discount mode" semantics).
            const discountIncrementRaw = customerDueData.discountAmount !== undefined
                ? Number(customerDueData.discountAmount)
                : 0;
            const hasDiscountIncrement = discountIncrementRaw > 0;
            const finalDiscountAmount = hasDiscountIncrement
                ? prevDiscountAmount + discountIncrementRaw
                : prevDiscountAmount;

            // Build the patch: only override discountAmount when there's an increment;
            // otherwise leave it untouched. paidAmount is passed through as-is when
            // present in customerDueData.
            const { discountAmount: _ignoredDiscount, ...restPatch } = customerDueData;

            const [updated] = await tx.update(customerDueTable)
                .set({
                    ...restPatch,
                    ...(hasDiscountIncrement ? { discountAmount: finalDiscountAmount } : {}),
                    updatedAt: getCurrentDate()
                })
                .where(eq(customerDueTable.id, id))
                .returning();

            // Insert a single history row in customer_due_updates that captures whatever
            // changed — collection delta and/or discount increment.
            const newPaidAmount = Number(updated.paidAmount ?? 0);
            const newTotalAmount = Number(updated.totalAmount ?? 0);
            const delta = Number((newPaidAmount - prevPaidAmount).toFixed(2));

            await tx.insert(customerDueUpdatesTable).values({
                customerDueId: id,
                updatedBy,
                totalAmount: newTotalAmount,
                paidAmount: newPaidAmount,
                collectedAmount: delta,
                isReplacement,
                discountAmount: hasDiscountIncrement ? discountIncrementRaw : 0,
                // Mark the history row as a discount entry when a discount was given,
                // regardless of the legacy `isDiscount` flag from the request.
                isDiscount: hasDiscountIncrement || isDiscount,
                createdAt: getCurrentDate(),
                updatedAt: getCurrentDate()
            });

            return updated;
        });

        return updatedCustomerDue;
    }

    static async deleteCustomerDue(id: string) {
        return await db.transaction(async (tx) => {
            // Check if customer due exists
            const existingCustomerDue = await tx.select().from(customerDueTable).where(eq(customerDueTable.id, id));
            if (existingCustomerDue.length === 0) {
                throw new AppError('Customer due record not found', 404);
            }

            // Delete the customer due
            const [deleted] = await tx.delete(customerDueTable)
                .where(eq(customerDueTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getCustomerDues(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        // Handle search functionality for customer name
        const searchConditions = [];
        
        // Check for search or customerName query parameters
        if (filter?.search || filter?.customerName) {
            const searchTerm = filter.search?.[0] || filter.customerName?.[0];
            if (searchTerm) {
                // Add case-insensitive partial match condition for customer name, email, or phone
                searchConditions.push(
                    or(
                        sql`LOWER(${customerTable.name}) LIKE LOWER(${'%' + searchTerm + '%'})`,
                        sql`LOWER(${customerTable.email}) LIKE LOWER(${'%' + searchTerm + '%'})`,
                        sql`LOWER(${customerTable.phone}) LIKE LOWER(${'%' + searchTerm + '%'})`
                    )
                );
            }
            
            // Remove search and customerName from filter to avoid conflicts
            const { search, customerName, ...restFilter } = filter;
            filter = restFilter;
        }

        const result = await filterWithPaginate(customerDueTable, {
            pagination,
            filter,
            where: searchConditions.length > 0 ? searchConditions : undefined,
            joins: [
                {
                    table: userTable,
                    alias: 'user',
                    condition: eq(customerDueTable.createdBy, userTable.id)
                },
                {
                    table: customerTable,
                    alias: 'customer',
                    condition: eq(customerDueTable.customerId, customerTable.id)
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(customerDueTable.maintainsId, maintainsTable.id)
                }
            ],
            orderBy: sql`${customerDueTable.updatedAt} DESC`,
            select: {
                id: customerDueTable.id,
                createdAt: customerDueTable.createdAt,
                updatedAt: customerDueTable.updatedAt,
                createdBy: sql`CASE
                    WHEN ${userTable.id} IS NOT NULL THEN
                        json_build_object(
                            'id', ${userTable.id},
                            'username', ${userTable.username},
                            'email', ${userTable.email}
                        )
                    ELSE NULL
                END`,
                customerId: customerDueTable.customerId,
                maintainsId: customerDueTable.maintainsId,
                totalAmount: customerDueTable.totalAmount,
                paidAmount: customerDueTable.paidAmount,
                discountAmount: customerDueTable.discountAmount,
                // User details (createdBy)
                username: userTable.username,
                fullname: userTable.fullName,
                // Customer details
                customerName: customerTable.name,
                email: customerTable.email,
                phone: customerTable.phone,
                about: customerTable.about,
                // Maintains details
                maintainsName: maintainsTable.name,
                maintainsType: maintainsTable.type
            }
        });

        const ids = result.list.map((r: any) => r.id);
        let updatesByDueId = new Map<string, any[]>();
        if (ids.length > 0) {
            const updates = await db
                .select({
                    id: customerDueUpdatesTable.id,
                    createdAt: customerDueUpdatesTable.createdAt,
                    updatedAt: customerDueUpdatesTable.updatedAt,
                    customerDueId: customerDueUpdatesTable.customerDueId,
                    updatedBy: customerDueUpdatesTable.updatedBy,
                    totalAmount: customerDueUpdatesTable.totalAmount,
                    paidAmount: customerDueUpdatesTable.paidAmount,
                    collectedAmount: customerDueUpdatesTable.collectedAmount,
                    isReplacement: customerDueUpdatesTable.isReplacement,
                    discountAmount: customerDueUpdatesTable.discountAmount,
                    isDiscount: customerDueUpdatesTable.isDiscount,
                    // User details for who made the update
                    updatedByName: userTable.fullName,
                    updatedByUsername: userTable.username,
                })
                .from(customerDueUpdatesTable)
                .innerJoin(userTable, eq(customerDueUpdatesTable.updatedBy, userTable.id))
                .where(inArray(customerDueUpdatesTable.customerDueId, ids))
                .orderBy(asc(customerDueUpdatesTable.createdAt));

            for (const u of updates) {
                const key = u.customerDueId as string;
                const arr = updatesByDueId.get(key) ?? [];
                arr.push(u);
                updatesByDueId.set(key, arr);
            }
        }

        const summaryRow = await getSummary(customerDueTable, {
            filter,
            where: searchConditions.length > 0 ? searchConditions : undefined,
            joins: [
                {
                    table: userTable,
                    alias: 'user',
                    condition: eq(customerDueTable.createdBy, userTable.id)
                },
                {
                    table: customerTable,
                    alias: 'customer',
                    condition: eq(customerDueTable.customerId, customerTable.id)
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(customerDueTable.maintainsId, maintainsTable.id)
                }
            ],
            summarySelect: {
                totalNumberOfDue: sql<number>`COUNT(*)`,
                totalDueCreated: sql<number>`COALESCE(SUM(${customerDueTable.totalAmount}), 0)`,
                totalDuePaid: sql<number>`COALESCE(SUM(${customerDueTable.paidAmount}), 0)`,
                totalDiscount: sql<number>`COALESCE(SUM(${customerDueTable.discountAmount}), 0)`,
                totalCurrentDue: sql<number>`COALESCE(SUM(${customerDueTable.totalAmount}), 0) - COALESCE(SUM(${customerDueTable.paidAmount}), 0) - COALESCE(SUM(${customerDueTable.discountAmount}), 0)`,
                totalDueCustomer: sql<number>`COUNT(DISTINCT ${customerDueTable.customerId})`
            }
        });

        return {
            ...result,
            list: result.list.map((r: any) => ({
                ...r,
                updates: updatesByDueId.get(r.id) ?? []
            })),
            summary: {
                totalNumberOfDue: Number(summaryRow?.totalNumberOfDue ?? 0),
                totalDueCreated: Number(summaryRow?.totalDueCreated ?? 0),
                totalDuePaid: Number(summaryRow?.totalDuePaid ?? 0),
                totalDiscount: Number(summaryRow?.totalDiscount ?? 0),
                totalCurrentDue: Number(summaryRow?.totalCurrentDue ?? 0),
                totalDueCustomer: Number(summaryRow?.totalDueCustomer ?? 0)
            }
        };
    }

    static async getCustomerDueById(id: string) {
        const result = await db.select({
            id: customerDueTable.id,
            createdAt: customerDueTable.createdAt,
            updatedAt: customerDueTable.updatedAt,
            createdBy: sql`CASE
                WHEN ${userTable.id} IS NOT NULL THEN
                    json_build_object(
                        'id', ${userTable.id},
                        'username', ${userTable.username},
                        'email', ${userTable.email}
                    )
                ELSE NULL
            END`,
            customerId: customerDueTable.customerId,
            maintainsId: customerDueTable.maintainsId,
            totalAmount: customerDueTable.totalAmount,
            paidAmount: customerDueTable.paidAmount,
            discountAmount: customerDueTable.discountAmount,
            // User details (createdBy)
            username: userTable.username,
            fullname: userTable.fullName,
            // Customer details
            customerName: customerTable.name,
            email: customerTable.email,
            phone: customerTable.phone,
            about: customerTable.about,
            // Maintains details
            maintainsName: maintainsTable.name,
            maintainsType: maintainsTable.type
        })
        .from(customerDueTable)
        .leftJoin(userTable, eq(customerDueTable.createdBy, userTable.id))
        .leftJoin(customerTable, eq(customerDueTable.customerId, customerTable.id))
        .leftJoin(maintainsTable, eq(customerDueTable.maintainsId, maintainsTable.id))
        .where(eq(customerDueTable.id, id))
        .limit(1);

        if (result.length === 0) {
            throw new AppError('Customer due record not found', 404);
        }

        const updates = await db
            .select({
                id: customerDueUpdatesTable.id,
                createdAt: customerDueUpdatesTable.createdAt,
                updatedAt: customerDueUpdatesTable.updatedAt,
                customerDueId: customerDueUpdatesTable.customerDueId,
                updatedBy: customerDueUpdatesTable.updatedBy,
                totalAmount: customerDueUpdatesTable.totalAmount,
                paidAmount: customerDueUpdatesTable.paidAmount,
                collectedAmount: customerDueUpdatesTable.collectedAmount,
                isReplacement: customerDueUpdatesTable.isReplacement,
                discountAmount: customerDueUpdatesTable.discountAmount,
                isDiscount: customerDueUpdatesTable.isDiscount,
                // User details for who made the update
                updatedByName: userTable.fullName,
                updatedByUsername: userTable.username,
            })
            .from(customerDueUpdatesTable)
            .innerJoin(userTable, eq(customerDueUpdatesTable.updatedBy, userTable.id))
            .where(eq(customerDueUpdatesTable.customerDueId, id))
            .orderBy(asc(customerDueUpdatesTable.createdAt));

        return { ...result[0], updates };
    }

    // Sum of collectedAmount for a given calendar date and maintains outlet
    static async getTotalCreditCollection(startDate: Date, endDate: Date, maintainsId: string, excludedProductIds: string[] = []): Promise<number> {

        let whereCondition = and(
            eq(customerDueTable.maintainsId, maintainsId),
            gte(customerDueUpdatesTable.createdAt, startDate),
            lte(customerDueUpdatesTable.createdAt, endDate),
            eq(customerDueUpdatesTable.isDiscount, false)
        );

        if (excludedProductIds.length > 0) {
            const excludedDues = db
                .select({ id: paymentTable.customerDueId })
                .from(paymentTable)
                .innerJoin(paymentSaleTable, eq(paymentTable.id, paymentSaleTable.paymentId))
                .innerJoin(saleTable, eq(paymentSaleTable.saleId, saleTable.id))
                .where(and(
                    inArray(saleTable.productId, excludedProductIds),
                    isNotNull(paymentTable.customerDueId)
                ));

            whereCondition = and(
                whereCondition,
                notInArray(customerDueTable.id, excludedDues)
            );
        }

        const [result] = await db
            .select({
                totalChanges: sql<number>`COALESCE(SUM(${customerDueUpdatesTable.collectedAmount}), 0)`
            })
            .from(customerDueUpdatesTable)
            .innerJoin(customerDueTable, eq(customerDueUpdatesTable.customerDueId, customerDueTable.id))
            .where(whereCondition);

        const total = Number(result?.totalChanges ?? 0);
        return Number.isFinite(total) ? total : 0;
    }
}
