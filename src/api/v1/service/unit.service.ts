import { units, NewUnit } from '../drizzle/schema/unit';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';

export class UnitService {
    // Create a new unit
    static async createUnit(unitData: Omit<NewUnit, 'id'>) {
        // Check if unit with same label already exists
        const existingUnit = await db.select().from(units).where(eq(units.unitLabel, unitData.unitLabel)).limit(1);

        if (existingUnit.length > 0) {
            throw new AppError('Unit with this label already exists', 409);
        }

        // Insert the unit into the database
        const [createdUnit] = await db.insert(units).values(unitData).returning();

        if (!createdUnit) {
            throw new AppError('Failed to create unit', 500);
        }

        return createdUnit;
    }

    // Get all units
    static async getAllUnits() {
        const allUnits = await db.select().from(units);
        return allUnits;
    }

    // Get unit by ID
    static async getUnitById(id: string) {
        const unit = await db.select().from(units).where(eq(units.id, id)).limit(1);

        if (unit.length === 0) {
            throw new AppError('Unit not found', 404);
        }

        return unit[0];
    }

    // Update unit
    static async updateUnit(id: string, unitData: Partial<Omit<NewUnit, 'id'>>) {
        // Check if unit exists
        const existingUnit = await db.select().from(units).where(eq(units.id, id)).limit(1);

        if (existingUnit.length === 0) {
            throw new AppError('Unit not found', 404);
        }

        // If updating unitLabel, check for uniqueness
        if (unitData.unitLabel) {
            const duplicateUnit = await db.select().from(units).where(eq(units.unitLabel, unitData.unitLabel)).limit(1);

            if (duplicateUnit.length > 0 && duplicateUnit[0].id !== id) {
                throw new AppError('Unit with this label already exists', 409);
            }
        }

        // Update the unit
        const [updatedUnit] = await db
            .update(units)
            .set({ ...unitData, updatedAt: new Date() })
            .where(eq(units.id, id))
            .returning();

        return updatedUnit;
    }

    // Delete unit
    static async deleteUnit(id: string) {
        // Check if unit exists
        const existingUnit = await db.select().from(units).where(eq(units.id, id)).limit(1);

        if (existingUnit.length === 0) {
            throw new AppError('Unit not found', 404);
        }

        // Delete the unit
        await db.delete(units).where(eq(units.id, id));

        return { success: true, message: 'Unit deleted successfully' };
    }
}