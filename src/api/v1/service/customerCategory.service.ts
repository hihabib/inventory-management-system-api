import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerCategoryTable, NewCustomerCategory } from "../drizzle/schema/customerCategory";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class CustomerCategoryService {
    static async createCustomerCategory(customerCategoryData: NewCustomerCategory) {
        try {
            const [createdCustomerCategory] = await db.insert(customerCategoryTable).values({ ...customerCategoryData }).returning();
            return createdCustomerCategory;
        } catch (error: any) {
            if (error.code === '23505') { // Unique constraint violation
                throw new Error('Customer category with this name already exists');
            }
            if (error.code === '23502') { // Not null constraint violation
                throw new Error('Required fields are missing');
            }
            if (error.code === '23514') { // Check constraint violation (for enum values)
                throw new Error('Invalid value provided for type field. Must be either "Outlet" or "Production"');
            }
            throw new Error(`Failed to create customer category: ${error.message}`);
        }
    }

    static async updateCustomerCategory(id: string, customerCategoryData: Partial<NewCustomerCategory>) {
        try {
            const updatedCustomerCategory = await db.transaction(async (tx) => {
                // Check if customer category exists
                const existingCustomerCategory = await tx.select().from(customerCategoryTable).where(eq(customerCategoryTable.id, id));
                if (existingCustomerCategory.length === 0) {
                    throw new Error('Customer category not found');
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
        } catch (error: any) {
            if (error.message === 'Customer category not found') {
                throw error; // Re-throw our custom error
            }
            if (error.code === '23505') { // Unique constraint violation
                throw new Error('Customer category with this name already exists');
            }
            if (error.code === '23502') { // Not null constraint violation
                throw new Error('Required fields cannot be null');
            }
            if (error.code === '23514') { // Check constraint violation (for enum values)
                throw new Error('Invalid value provided for type field. Must be either "Outlet" or "Production"');
            }
            throw new Error(`Failed to update customer category: ${error.message}`);
        }
    }

    static async deleteCustomerCategory(id: string) {
        try {
            return await db.transaction(async (tx) => {
                // Check if customer category exists
                const existingCustomerCategory = await tx.select().from(customerCategoryTable).where(eq(customerCategoryTable.id, id));
                if (existingCustomerCategory.length === 0) {
                    throw new Error('Customer category not found');
                }

                // Delete the customer category
                const [deleted] = await tx.delete(customerCategoryTable)
                    .where(eq(customerCategoryTable.id, id))
                    .returning();

                return deleted;
            });
        } catch (error: any) {
            if (error.message === 'Customer category not found') {
                throw error; // Re-throw our custom error
            }
            if (error.code === '23503') { // Foreign key constraint violation
                throw new Error('Cannot delete customer category as it is being used by other records');
            }
            throw new Error(`Failed to delete customer category: ${error.message}`);
        }
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