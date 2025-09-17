import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewRole, roleTable } from "../drizzle/schema/role";
import { FilterOptions, filterWithPaginate, PaginationOptions } from "../utils/filterWithPaginate";
import { AppError } from "../utils/AppError";

export class RoleService {
    static async createRole(newRole: NewRole) {
        const [createdRole] = await db.insert(roleTable).values(newRole).returning();
        return createdRole;
    }
    static async getRoles(
        pagination: PaginationOptions = {},
        filter?: FilterOptions
    ) {
        return await filterWithPaginate(roleTable, {pagination, filter});
    }

    static async deleteRole(id: string) {
        await db.delete(roleTable).where(eq(roleTable.id, id));
        return {
            deletedRoleId: id
        };
    }

    static async updateRole(id: string, updatedRole: NewRole) {
        const { rowCount } = await db.update(roleTable).set(updatedRole).where(eq(roleTable.id, id));
        if (rowCount === 1) {
            return this.getRole(id)
        }
        throw new AppError('Role not found', 404)
    }
    static async getRole(id: string) {
        return (await db.select().from(roleTable).where(eq(roleTable.id, id)))?.[0];
    }
}