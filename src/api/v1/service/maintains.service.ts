import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewMaintains, maintainsTable } from "../drizzle/schema/maintains";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";

export class MaintainsService {
    static async createMaintains(maintainsData: NewMaintains) {
        const [createdMaintains] = await db.insert(maintainsTable).values({ ...maintainsData }).returning();
        return createdMaintains;
    }

    static async updateMaintains(id: string, maintainsData: Partial<NewMaintains>) {
        const updatedMaintains = await db.transaction(async (tx) => {
            // Check if maintains exists
            const existingMaintains = await tx.select().from(maintainsTable).where(eq(maintainsTable.id, id));
            if (existingMaintains.length === 0) {
                tx.rollback();
            }

            // Update the maintains
            const [updated] = await tx.update(maintainsTable)
                .set({
                    ...maintainsData,
                    updatedAt: new Date()
                })
                .where(eq(maintainsTable.id, id))
                .returning();

            return updated;
        });

        return updatedMaintains;
    }

    static async deleteMaintains(id: string) {
        return await db.transaction(async (tx) => {
            // Check if maintains exists
            const existingMaintains = await tx.select().from(maintainsTable).where(eq(maintainsTable.id, id));
            if (existingMaintains.length === 0) {
                tx.rollback();
            }

            // Delete the maintains
            const [deleted] = await tx.delete(maintainsTable)
                .where(eq(maintainsTable.id, id))
                .returning();

            return deleted;
        });
    }

    static async getMaintains(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await filterWithPaginate(maintainsTable, { pagination, filter });
    }

    static async getMaintainsById(id: string) {
        const [maintains] = await db.select().from(maintainsTable).where(eq(maintainsTable.id, id));
        return maintains;
    }

    
}