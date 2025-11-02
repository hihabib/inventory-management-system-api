import { eq, desc } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewExpense, expenseTable } from "../drizzle/schema/expense";
import { userTable } from "../drizzle/schema/user";
import { maintainsTable } from "../drizzle/schema/maintains";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getCurrentDate } from "../utils/timezone";

export class ExpenseService {
    static async createExpense(expenseData: NewExpense) {
        // Apply decimal precision formatting
        const formattedData = {
            ...expenseData,
            amount: expenseData.amount.toString(),
            date: new Date(expenseData.date),
            createdAt: getCurrentDate(),
            updatedAt: getCurrentDate()
        };

        const [createdExpense] = await db.insert(expenseTable)
            .values(formattedData)
            .returning();

        return createdExpense;
    }

    static async getExpenses(pagination: PaginationOptions, filter: FilterOptions) {
        const result = await filterWithPaginate(expenseTable, {
            pagination,
            filter,
            joins: [
                {
                    table: userTable,
                    condition: eq(expenseTable.userId, userTable.id),
                    alias: 'user'
                },
                {
                    table: maintainsTable,
                    condition: eq(expenseTable.maintainsId, maintainsTable.id),
                    alias: 'maintains'
                }
            ],
            select: {
                id: expenseTable.id,
                userId: expenseTable.userId,
                maintainsId: expenseTable.maintainsId,
                amount: expenseTable.amount,
                description: expenseTable.description,
                date: expenseTable.date,
                createdAt: expenseTable.createdAt,
                updatedAt: expenseTable.updatedAt,
                user: {
                    id: userTable.id,
                    username: userTable.username,
                    email: userTable.email,
                    fullName: userTable.fullName
                },
                maintains: {
                    id: maintainsTable.id,
                    name: maintainsTable.name,
                    type: maintainsTable.type,
                    location: maintainsTable.location
                }
            },
            orderBy: [desc(expenseTable.createdAt)]
        });

        return result;
    }

    static async getExpenseById(id: string) {
        const [expense] = await db
            .select({
                id: expenseTable.id,
                userId: expenseTable.userId,
                maintainsId: expenseTable.maintainsId,
                amount: expenseTable.amount,
                description: expenseTable.description,
                date: expenseTable.date,
                createdAt: expenseTable.createdAt,
                updatedAt: expenseTable.updatedAt,
                user: {
                    id: userTable.id,
                    username: userTable.username,
                    email: userTable.email,
                    fullName: userTable.fullName
                },
                maintains: {
                    id: maintainsTable.id,
                    name: maintainsTable.name,
                    type: maintainsTable.type,
                    location: maintainsTable.location
                }
            })
            .from(expenseTable)
            .leftJoin(userTable, eq(expenseTable.userId, userTable.id))
            .leftJoin(maintainsTable, eq(expenseTable.maintainsId, maintainsTable.id))
            .where(eq(expenseTable.id, id));

        return expense;
    }

    static async updateExpense(id: string, expenseData: Partial<NewExpense>) {
        // Check if expense exists
        const existingExpense = await db.select().from(expenseTable).where(eq(expenseTable.id, id));
        if (existingExpense.length === 0) {
            throw new Error(`Expense with ID '${id}' not found. Please verify the expense ID and try again.`);
        }

        // Apply decimal precision formatting
        const formattedData = {
            ...expenseData,
            ...(expenseData.amount && { amount: expenseData.amount.toString() }),
            ...(expenseData.date && { date: new Date(expenseData.date) }),
            updatedAt: getCurrentDate()
        };

        const [updatedExpense] = await db.update(expenseTable)
            .set(formattedData)
            .where(eq(expenseTable.id, id))
            .returning();

        return updatedExpense;
    }

    static async deleteExpense(id: string) {
        // Check if expense exists
        const existingExpense = await db.select().from(expenseTable).where(eq(expenseTable.id, id));
        if (existingExpense.length === 0) {
            throw new Error(`Expense with ID '${id}' not found. Please verify the expense ID and try again.`);
        }

        const [deletedExpense] = await db.delete(expenseTable)
            .where(eq(expenseTable.id, id))
            .returning();

        return deletedExpense;
    }
}