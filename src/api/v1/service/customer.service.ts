import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerTable, NewCustomer } from "../drizzle/schema/customer";
import { customerCategoryTable } from "../drizzle/schema/customerCategory";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class CustomerService {
    static async createCustomer(customerData: NewCustomer) {
        return await db.transaction(async (tx) => {
            // Check if email already exists
            if (customerData.email) {
                const existingEmailCustomer = await tx.select().from(customerTable).where(eq(customerTable.email, customerData.email));
                if (existingEmailCustomer.length > 0) {
                    throw new Error(`Customer with email '${customerData.email}' already exists`);
                }
            }

            // Check if phone already exists
            if (customerData.phone) {
                const existingPhoneCustomer = await tx.select().from(customerTable).where(eq(customerTable.phone, customerData.phone));
                if (existingPhoneCustomer.length > 0) {
                    throw new Error(`Customer with phone '${customerData.phone}' already exists`);
                }
            }

            // Create the customer
            const [createdCustomer] = await tx.insert(customerTable).values({ ...customerData }).returning();
            return createdCustomer;
        });
    }

    static async updateCustomer(id: string, customerData: Partial<NewCustomer>) {
        const updatedCustomer = await db.transaction(async (tx) => {
            // Check if customer exists
            const existingCustomer = await tx.select().from(customerTable).where(eq(customerTable.id, id));
            if (existingCustomer.length === 0) {
                throw new Error(`Customer with id '${id}' not found`);
            }

            // Check if email already exists (excluding current customer)
            if (customerData.email) {
                const existingEmailCustomer = await tx.select().from(customerTable).where(eq(customerTable.email, customerData.email));
                if (existingEmailCustomer.length > 0 && existingEmailCustomer[0].id !== id) {
                    throw new Error(`Customer with email '${customerData.email}' already exists`);
                }
            }

            // Check if phone already exists (excluding current customer)
            if (customerData.phone) {
                const existingPhoneCustomer = await tx.select().from(customerTable).where(eq(customerTable.phone, customerData.phone));
                if (existingPhoneCustomer.length > 0 && existingPhoneCustomer[0].id !== id) {
                    throw new Error(`Customer with phone '${customerData.phone}' already exists`);
                }
            }

            // Update the customer
            const [updated] = await tx.update(customerTable)
                .set({
                    ...customerData,
                    updatedAt: getCurrentDate()
                })
                .where(eq(customerTable.id, id))
                .returning();

            return updated;
        });

        return updatedCustomer;
    }

    static async deleteCustomer(id: string) {
        return await db.transaction(async (tx) => {
            // Check if customer exists
            const existingCustomer = await tx.select().from(customerTable).where(eq(customerTable.id, id));
            if (existingCustomer.length === 0) {
                throw new Error(`Customer with id '${id}' not found`);
            }

            // Delete the customer
            const [deleted] = await tx.delete(customerTable)
                .where(eq(customerTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getCustomers(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await filterWithPaginate(customerTable, {
            pagination,
            filter,
            joins: [
                {
                    table: customerCategoryTable,
                    alias: 'customerCategory',
                    condition: eq(customerTable.categoryId, customerCategoryTable.id),
                    type: "left"
                }
            ],
            select: {
                id: customerTable.id,
                createdAt: customerTable.createdAt,
                updatedAt: customerTable.updatedAt,
                createdBy: customerTable.createdBy,
                category: {
                    id: customerCategoryTable.id,
                    createdAt: customerCategoryTable.createdAt,
                    updatedAt: customerCategoryTable.updatedAt,
                    createdBy: customerCategoryTable.createdBy,
                    categoryName: customerCategoryTable.categoryName,
                    discountType: customerCategoryTable.discountType,
                    discountAmount: customerCategoryTable.discountAmount,
                },
                name: customerTable.name,
                email: customerTable.email,
                phone: customerTable.phone,
                about: customerTable.about,
                discountType: customerTable.discountType,
                discountAmount: customerTable.discountAmount
            }
        });
    }

    static async getCustomerById(id: string) {
        const [customer] = await db
            .select({
                id: customerTable.id,
                createdAt: customerTable.createdAt,
                updatedAt: customerTable.updatedAt,
                createdBy: customerTable.createdBy,
                category: {
                    id: customerCategoryTable.id,
                    createdAt: customerCategoryTable.createdAt,
                    updatedAt: customerCategoryTable.updatedAt,
                    createdBy: customerCategoryTable.createdBy,
                    categoryName: customerCategoryTable.categoryName,
                    discountType: customerCategoryTable.discountType,
                    discountAmount: customerCategoryTable.discountAmount,
                },
                name: customerTable.name,
                email: customerTable.email,
                phone: customerTable.phone,
                about: customerTable.about,
            })
            .from(customerTable)
            .leftJoin(customerCategoryTable, eq(customerTable.categoryId, customerCategoryTable.id))
            .where(eq(customerTable.id, id));

        return customer;
    }
}