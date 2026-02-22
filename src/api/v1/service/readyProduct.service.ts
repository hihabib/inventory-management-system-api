import { and, asc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewReadyProduct, readyProductTable } from "../drizzle/schema/readyProduct";
import { productTable } from "../drizzle/schema/product";
import { userTable } from "../drizzle/schema/user";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class ReadyProductService {
    static async createOrUpdateBulk(items: Array<NewReadyProduct & { id?: string }>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const quantity = Number(item.quantityInMainUnit);
                if (isNaN(quantity) || quantity <= 0) {
                    throw new Error("quantityInMainUnit must be a positive number");
                }
                let probable = item.probableRemainingQuantity;
                if (probable === undefined || probable === null) {
                    probable = quantity;
                }
                probable = Number(probable);
                if (isNaN(probable) || probable < 0) {
                    throw new Error("probableRemainingQuantity must be a non-negative number");
                }
                if (probable > quantity) {
                    throw new Error("probableRemainingQuantity cannot be greater than quantityInMainUnit");
                }
                const baseData: NewReadyProduct = {
                    productId: item.productId,
                    quantityInMainUnit: quantity,
                    probableRemainingQuantity: probable,
                    note: item.note,
                    isDeleted: false,
                    createdBy: userId,
                    updatedBy: userId,
                    createdAt: getCurrentDate(),
                    updatedAt: getCurrentDate()
                };
                if (item.id) {
                    const existingRows = await tx
                        .select()
                        .from(readyProductTable)
                        .where(eq(readyProductTable.id, item.id));
                    if (existingRows.length === 0) {
                        throw new Error(`Ready product row with ID '${item.id}' not found`);
                    }
                    const existing = existingRows[0];
                    if (existing.productId !== item.productId) {
                        const [productRow] = await tx
                            .select({ name: productTable.name })
                            .from(productTable)
                            .where(eq(productTable.id, item.productId));
                        const productName = productRow?.name || "";
                        throw new Error(`Row ID '${item.id}' does not contain product '${productName}'`);
                    }
                    const newQuantity = Number(existing.quantityInMainUnit) + quantity;
                    let newProbable: number;
                    if (item.probableRemainingQuantity === undefined || item.probableRemainingQuantity === null) {
                        newProbable = Number(existing.probableRemainingQuantity);
                    } else {
                        newProbable = Number(item.probableRemainingQuantity);
                        if (newProbable > newQuantity) {
                            throw new Error("probableRemainingQuantity cannot be greater than quantityInMainUnit after addition");
                        }
                    }
                    const [updated] = await tx
                        .update(readyProductTable)
                        .set({
                            quantityInMainUnit: newQuantity,
                            probableRemainingQuantity: newProbable,
                            note: item.note !== undefined ? item.note : existing.note,
                            updatedBy: userId,
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(readyProductTable.id, item.id))
                        .returning();
                    results.push(updated);
                } else {
                    const [created] = await tx
                        .insert(readyProductTable)
                        .values(baseData)
                        .returning();
                    results.push(created);
                }
            }
            return results;
        });
    }

    static async updateBulk(items: Array<{ id: string } & Partial<NewReadyProduct>>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const existingRows = await tx
                    .select()
                    .from(readyProductTable)
                    .where(eq(readyProductTable.id, item.id));
                if (existingRows.length === 0) {
                    throw new Error(`Ready product row with ID '${item.id}' not found`);
                }
                const existing = existingRows[0];
                let quantity = item.quantityInMainUnit !== undefined ? Number(item.quantityInMainUnit) : Number(existing.quantityInMainUnit);
                if (isNaN(quantity) || quantity <= 0) {
                    throw new Error("quantityInMainUnit must be a positive number");
                }
                let probable: number;
                if (item.probableRemainingQuantity === undefined || item.probableRemainingQuantity === null) {
                    probable = Number(existing.probableRemainingQuantity);
                } else {
                    probable = Number(item.probableRemainingQuantity);
                }
                if (isNaN(probable) || probable < 0) {
                    throw new Error("probableRemainingQuantity must be a non-negative number");
                }
                if (probable > quantity) {
                    throw new Error("probableRemainingQuantity cannot be greater than quantityInMainUnit");
                }
                const [updated] = await tx
                    .update(readyProductTable)
                    .set({
                        quantityInMainUnit: quantity,
                        probableRemainingQuantity: probable,
                        note: item.note !== undefined ? item.note : existing.note,
                        updatedBy: userId,
                        updatedAt: getCurrentDate()
                    })
                    .where(eq(readyProductTable.id, item.id))
                    .returning();
                results.push(updated);
            }
            return results;
        });
    }

    static async deleteBulk(items: Array<{ id: string; hardDelete?: boolean }>, userId: string) {
        return await db.transaction(async (tx) => {
            const results = [];
            for (const item of items) {
                const existingRows = await tx
                    .select()
                    .from(readyProductTable)
                    .where(eq(readyProductTable.id, item.id));
                if (existingRows.length === 0) {
                    throw new Error(`Ready product row with ID '${item.id}' not found`);
                }
                if (item.hardDelete) {
                    const [deleted] = await tx
                        .delete(readyProductTable)
                        .where(eq(readyProductTable.id, item.id))
                        .returning();
                    results.push(deleted);
                } else {
                    const [updated] = await tx
                        .update(readyProductTable)
                        .set({
                            isDeleted: true,
                            updatedBy: userId,
                            updatedAt: getCurrentDate()
                        })
                        .where(eq(readyProductTable.id, item.id))
                        .returning();
                    results.push(updated);
                }
            }
            return results;
        });
    }

    static async getReadyProducts(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        const baseFilter: FilterOptions = {
            ...filter,
            isDeleted: [false]
        };
        const result = await filterWithPaginate(readyProductTable, {
            pagination,
            filter: baseFilter,
            joins: [
                {
                    table: productTable,
                    alias: "product",
                    condition: eq(readyProductTable.productId, productTable.id)
                }
            ],
            select: {
                id: readyProductTable.id,
                productId: readyProductTable.productId,
                quantityInMainUnit: readyProductTable.quantityInMainUnit,
                probableRemainingQuantity: readyProductTable.probableRemainingQuantity,
                note: readyProductTable.note,
                isDeleted: readyProductTable.isDeleted,
                createdBy: readyProductTable.createdBy,
                updatedBy: readyProductTable.updatedBy,
                createdAt: readyProductTable.createdAt,
                updatedAt: readyProductTable.updatedAt,
                product: {
                    id: productTable.id,
                    name: productTable.name
                }
            },
            orderBy: [asc(readyProductTable.createdAt)]
        });
        const groupedMap = new Map<string, any>();
        const groupedList: any[] = [];
        for (const row of result.list as any[]) {
            const key = row.productId;
            let entry = groupedMap.get(key);
            if (!entry) {
                entry = {
                    productId: row.productId,
                    product: row.product,
                    rows: [] as any[]
                };
                groupedMap.set(key, entry);
                groupedList.push(entry);
            }
            entry.rows.push({
                id: row.id,
                quantityInMainUnit: row.quantityInMainUnit,
                probableRemainingQuantity: row.probableRemainingQuantity,
                note: row.note,
                isDeleted: row.isDeleted,
                createdBy: row.createdBy,
                updatedBy: row.updatedBy,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt
            });
        }
        return {
            list: groupedList,
            pagination: result.pagination
        };
    }

    static async getReadyProductById(id: string) {
        const [row] = await db
            .select()
            .from(readyProductTable)
            .where(and(eq(readyProductTable.id, id), eq(readyProductTable.isDeleted, false)));
        return row;
    }
}
