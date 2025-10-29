import { eq, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerDueTable, NewCustomerDue } from "../drizzle/schema/customerDue";
import { userTable } from "../drizzle/schema/user";
import { customerTable } from "../drizzle/schema/customer";
import { maintainsTable } from "../drizzle/schema/maintains";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";
import { AppError } from "../utils/AppError";

export class CustomerDueService {
    static async createCustomerDue(customerDueData: NewCustomerDue) {
        const [createdCustomerDue] = await db.insert(customerDueTable).values({
            ...customerDueData,
            createdAt: getCurrentDate(),
            updatedAt: getCurrentDate()
        }).returning();
        return createdCustomerDue;
    }

    static async updateCustomerDue(id: string, customerDueData: Partial<NewCustomerDue>) {
        const updatedCustomerDue = await db.transaction(async (tx) => {
            // Check if customer due exists
            const existingCustomerDue = await tx.select().from(customerDueTable).where(eq(customerDueTable.id, id));
            if (existingCustomerDue.length === 0) {
                throw new AppError('Customer due record not found', 404);
            }

            // Update the customer due
            const [updated] = await tx.update(customerDueTable)
                .set({
                    ...customerDueData,
                    updatedAt: getCurrentDate()
                })
                .where(eq(customerDueTable.id, id))
                .returning();

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
                // Add case-insensitive partial match condition for customer name
                searchConditions.push(
                    sql`LOWER(${customerTable.name}) LIKE LOWER(${'%' + searchTerm + '%'})`
                );
            }
            
            // Remove search and customerName from filter to avoid conflicts
            const { search, customerName, ...restFilter } = filter;
            filter = restFilter;
        }

        return await filterWithPaginate(customerDueTable, {
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
            select: {
                id: customerDueTable.id,
                createdAt: customerDueTable.createdAt,
                updatedAt: customerDueTable.updatedAt,
                createdBy: customerDueTable.createdBy,
                customerId: customerDueTable.customerId,
                maintainsId: customerDueTable.maintainsId,
                totalAmount: customerDueTable.totalAmount,
                paidAmount: customerDueTable.paidAmount,
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
    }

    static async getCustomerDueById(id: string) {
        const result = await db.select({
            id: customerDueTable.id,
            createdAt: customerDueTable.createdAt,
            updatedAt: customerDueTable.updatedAt,
            createdBy: customerDueTable.createdBy,
            customerId: customerDueTable.customerId,
            maintainsId: customerDueTable.maintainsId,
            totalAmount: customerDueTable.totalAmount,
            paidAmount: customerDueTable.paidAmount,
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

        return result[0];
    }
}