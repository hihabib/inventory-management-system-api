import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewProductCategory, productCategoryTable } from "../drizzle/schema/productCategory";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class ProductCategoryService {
    static async createProductCategory(productCategoryData: NewProductCategory) {
        // @ts-ignore
        const [createdProductCategory] = await db.insert(productCategoryTable).values({...productCategoryData}).returning();
        return createdProductCategory;
    }

    static async updateProductCategory(id: string, productCategory: Partial<NewProductCategory>) {
        const updatedProductCategory = await db.transaction(async (tx) => {
            // Check if product category exists
            const existingProductCategory = await tx.select().from(productCategoryTable).where(eq(productCategoryTable.id, id));
            if (existingProductCategory.length === 0) {
                tx.rollback();
            }

            // Prevent circular references in parent-child relationship
            if (productCategory.parentId) {
                // Check if the parent exists
                const parentExists = await tx.select().from(productCategoryTable).where(eq(productCategoryTable.id, productCategory.parentId));
                if (parentExists.length === 0) {
                    tx.rollback();
                }

                // Prevent setting itself as parent
                if (productCategory.parentId === id) {
                    tx.rollback();
                }

                // Prevent circular references (parent can't be a child of its children)
                const childCategories = await tx.select().from(productCategoryTable).where(eq(productCategoryTable.parentId, id));
                if (childCategories.some(child => child.id === productCategory.parentId)) {
                    tx.rollback();
                }
            }

            // Update the product category
            const [updated] = await tx.update(productCategoryTable)
                .set({
                    ...productCategory,
                    updatedAt: getCurrentDate()
                })
                .where(eq(productCategoryTable.id, id))
                .returning();

            return updated;
        });

        return updatedProductCategory;
    }

    static async deleteProductCategory(id: string) {
        return await db.transaction(async (tx) => {
            // Check if product category exists
            const existingProductCategory = await tx.select().from(productCategoryTable).where(eq(productCategoryTable.id, id));
            if (existingProductCategory.length === 0) {
                tx.rollback();
            }

            // Check if there are child categories
            const childCategories = await tx.select().from(productCategoryTable).where(eq(productCategoryTable.parentId, id));
            if (childCategories.length > 0) {
                // Update child categories to have no parent
                await tx.update(productCategoryTable)
                    .set({ parentId: null })
                    .where(eq(productCategoryTable.parentId, id));
            }

            // Soft delete the product category
            const [softDeleted] = await tx.update(productCategoryTable)
                .set({
                    isDeleted: true,
                    deletedAt: new Date()
                })
                .where(eq(productCategoryTable.id, id))
                .returning();

            return softDeleted;
        });
    }

    static async findEffectiveVat(categoryId: string): Promise<number | null> {
        let currentId: string | null = categoryId;
        
        while (currentId) {
             const [category] = await db.select({
                vat: productCategoryTable.vat,
                parentId: productCategoryTable.parentId
             })
             .from(productCategoryTable)
             .where(eq(productCategoryTable.id, currentId));
             
             if (!category) break;
             
             if (category.vat !== null) {
                 return category.vat;
             }
             
             currentId = category.parentId;
        }
        
        return null;
    }

    static async getProductCategories(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        const result = await filterWithPaginate(productCategoryTable, {
            pagination,
            filter: {
                ...filter,
                'isDeleted': [false]
            }
        });

        // @ts-ignore
        const enrichedData = await Promise.all(result.list.map(async (category) => {
            const effectiveVat = await this.findEffectiveVat(category.id);
            return { ...category, vat: effectiveVat };
        }));

        return {
            ...result,
            list: enrichedData
        };
    }

    static async getProductCategoryById(id: string) {
        const [productCategory] = await db.select().from(productCategoryTable).where(eq(productCategoryTable.id, id));
        
        if (!productCategory) return undefined;

        const effectiveVat = await this.findEffectiveVat(id);
        return { ...productCategory, vat: effectiveVat };
    }

 

}