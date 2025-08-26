import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';
import { NewOutlet, outlets } from '../drizzle/schema/outet';

export class OutletService {
    // Create a new outlet
    static async createOutlet(outletData: Omit<NewOutlet, 'id'>) {
        // Insert the outlet into the database
        const [createdOutlet] = await db.insert(outlets).values(outletData).returning();

        if (!createdOutlet) {
            throw new AppError('Failed to create outlet', 500);
        }

        return createdOutlet;
    }

    // Get all outlets
    static async getAllOutlets() {
        const allOutlets = await db.select().from(outlets);
        return allOutlets;
    }

    // Get outlet by ID
    static async getOutletById(id: string) {
        const outlet = await db.select().from(outlets).where(eq(outlets.id, id)).limit(1);

        if (outlet.length === 0) {
            throw new AppError('Outlet not found', 404);
        }

        return outlet[0];
    }

    // Update outlet
    static async updateOutlet(id: string, outletData: Partial<Omit<NewOutlet, 'id'>>) {
        // Check if outlet exists
        const existingOutlet = await db.select().from(outlets).where(eq(outlets.id, id)).limit(1);

        if (existingOutlet.length === 0) {
            throw new AppError('Outlet not found', 404);
        }

        // Update the outlet
        const [updatedOutlet] = await db
            .update(outlets)
            .set({ ...outletData, updatedAt: new Date() })
            .where(eq(outlets.id, id))
            .returning();

        return updatedOutlet;
    }

    // Delete outlet
    static async deleteOutlet(id: string) {
        // Check if outlet exists
        const existingOutlet = await db.select().from(outlets).where(eq(outlets.id, id)).limit(1);

        if (existingOutlet.length === 0) {
            throw new AppError('Outlet not found', 404);
        }

        // Delete the outlet
        await db.delete(outlets).where(eq(outlets.id, id));

        return { success: true, message: 'Outlet deleted successfully' };
    }
}