import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerCategoryTable, NewCustomerCategory } from "../drizzle/schema/customerCategory";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class CustomerCategoryService {
    static async createCustomerCategory(customerCategoryData: NewCustomerCategory) {
        const [createdCustomerCategory] = await db.insert(customerCategoryTable).values({ ...customerCategoryData }).returning();
        return createdCustomerCategory;
    }

    static async updateCustomerCategory(id: string, customerCategoryData: Partial<NewCustomerCategory>) {
        const updatedCustomerCategory = await db.transaction(async (tx) => {
            // Check if customer category exists
            const existingCustomerCategory = await tx.select().from(customerCategoryTable).where(eq(customerCategoryTable.id, id));
            if (existingCustomerCategory.length === 0) {
                tx.rollback();
            }

            // Update the customer category
            const [updated] = await tx.update(customerCategoryTable)
                .set({
                    ...customerCategoryData,
                    updatedAt: getCurrentDate()
                })
                .where(eq(customerCategoryTable.id, id))
                .returning();

            return updated;
        });

        return updatedCustomerCategory;
    }

    static async deleteCustomerCategory(id: string) {
        return await db.transaction(async (tx) => {
            // Check if customer category exists
            const existingCustomerCategory = await tx.select().from(customerCategoryTable).where(eq(customerCategoryTable.id, id));
            if (existingCustomerCategory.length === 0) {
                tx.rollback();
            }

            // Delete the customer category
            const [deleted] = await tx.delete(customerCategoryTable)
                .where(eq(customerCategoryTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getCustomerCategories(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await filterWithPaginate(customerCategoryTable, { pagination, filter });
    }

    static async getCustomerCategoryById(id: string) {
        const [customerCategory] = await db.select().from(customerCategoryTable).where(eq(customerCategoryTable.id, id));
        return customerCategory;
    }
}