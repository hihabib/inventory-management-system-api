import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewCustomer, customerTable } from "../drizzle/schema/customer";
import { customerCategoryTable } from "../drizzle/schema/customerCategory";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";

export class CustomerService {
    static async createCustomer(customerData: NewCustomer) {
        const [createdCustomer] = await db.insert(customerTable).values({ ...customerData }).returning();
        return createdCustomer;
    }

    static async updateCustomer(id: string, customerData: Partial<NewCustomer>) {
        const updatedCustomer = await db.transaction(async (tx) => {
            // Check if customer exists
            const existingCustomer = await tx.select().from(customerTable).where(eq(customerTable.id, id));
            if (existingCustomer.length === 0) {
                tx.rollback();
            }

            // Update the customer
            const [updated] = await tx.update(customerTable)
                .set({
                    ...customerData,
                    updatedAt: new Date()
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
                tx.rollback();
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