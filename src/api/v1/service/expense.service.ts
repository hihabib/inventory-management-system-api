import { eq, desc, asc, and, gte, lte, sql } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewExpense, expenseTable } from "../drizzle/schema/expense";
import { userTable } from "../drizzle/schema/user";
import { maintainsTable } from "../drizzle/schema/maintains";
import { FilterOptions, PaginationOptions, filterWithPaginate } from "../utils/filterWithPaginate";
import { getSummary } from "../utils/summary";
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

    static async getExpenses(
        pagination: PaginationOptions,
        filter: FilterOptions,
        sort: 'asc' | 'desc' = 'desc'
    ) {
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
            orderBy: sort === 'asc' ? [asc(expenseTable.createdAt)] : [desc(expenseTable.createdAt)]
        });

        const summaryRow = await getSummary(expenseTable, {
            filter,
            joins: [
                {
                    table: userTable,
                    alias: 'user',
                    condition: eq(expenseTable.userId, userTable.id)
                },
                {
                    table: maintainsTable,
                    alias: 'maintains',
                    condition: eq(expenseTable.maintainsId, maintainsTable.id)
                }
            ],
            summarySelect: {
                totalExpense: sql<number>`COALESCE(SUM(COALESCE(${expenseTable.amount}::numeric, 0)), 0)`
            }
        });

        return {
            ...result,
            summary: {
                totalExpense: Number(summaryRow?.totalExpense ?? 0)
            }
        };
    }

    static async getExpenseById(id: number) {
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

    // Get total expense for a specific calendar date and maintains outlet
    // Filters by the "date" column (not created_at) and sums "amount"
    static async getTotalExpense(startDate: Date, endDate:Date, maintainsId: string): Promise<number> {
    

        const [result] = await db
            .select({
                totalAmount: sql<number>`COALESCE(SUM(COALESCE(${expenseTable.amount}::numeric, 0)), 0)`
            })
            .from(expenseTable)
            .where(
                and(
                    eq(expenseTable.maintainsId, maintainsId),
                    gte(expenseTable.date, startDate),
                    lte(expenseTable.date, endDate)
                )
            );

        const total = Number(result?.totalAmount ?? 0);
        return Number.isFinite(total) ? total : 0;
    }

    static async updateExpense(id: number, expenseData: Partial<NewExpense>) {
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

    static async deleteExpense(id: number) {
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