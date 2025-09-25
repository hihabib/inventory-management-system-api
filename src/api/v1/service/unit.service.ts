import { desc, eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewUnit, unitTable } from "../drizzle/schema/unit";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class UnitService {
    static async createUnit(unit: NewUnit) {
        const [createdUnit] = await db.insert(unitTable).values({
            ...unit
        }).returning();
        return createdUnit;
    }

    static async updateUnit(id: string, unit: Partial<NewUnit>) {
        const updatedUnit = await db.transaction(async (tx) => {
            // Check if unit exists
            const existingUnit = await tx.select().from(unitTable).where(eq(unitTable.id, id));
            if (existingUnit.length === 0) {
                tx.rollback();
            }

            // Update the unit
            const [updated] = await tx.update(unitTable)
                .set({
                    ...unit,
                    updatedAt: getCurrentDate()
                })
                .where(eq(unitTable.id, id))
                .returning();

            return updated;
        });

        return updatedUnit;
    }

    static async deleteUnit(id: string) {
        return await db.transaction(async (tx) => {
            // Check if unit exists
            const existingUnit = await tx.select().from(unitTable).where(eq(unitTable.id, id));
            if (existingUnit.length === 0) {
                tx.rollback();
            }

            // Delete the unit
            const [deleted] = await tx.delete(unitTable)
                .where(eq(unitTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getUnits(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        return await filterWithPaginate(unitTable, {pagination, filter});
    }

    static async getUnitById(id: string) {
        const [unit] = await db.select().from(unitTable).where(eq(unitTable.id, id));
        return unit;
    }
}