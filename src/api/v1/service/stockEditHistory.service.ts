import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { stockEditHistoryTable, NewStockEditHistory } from "../drizzle/schema/stockEditHistory";

export interface FieldChange {
    field: 'totalQuantity' | 'note';
    oldValue: any;
    newValue: any;
}

export class StockEditHistoryService {
    /**
     * Record an edit history entry for a stock record.
     * Automatically determines if the field is numeric or text based on the field name.
     */
    static async recordEditHistory(params: {
        tx?: any;
        stockId: string;
        editedBy: string;
        fieldChanged: FieldChange['field'];
        oldValue: any;
        newValue: any;
        changeReason?: string;
    }) {
        const { tx, stockId, editedBy, fieldChanged, oldValue, newValue, changeReason } = params;
        const connection = tx || db;

        // For numeric fields, store in both numeric and text columns
        const isNumericField = fieldChanged === 'totalQuantity';

        const insertData: NewStockEditHistory = {
            stockId,
            editedBy,
            editedAt: new Date(),
            fieldChanged,
            oldValue: isNumericField ? null : String(oldValue ?? ''),
            newValue: isNumericField ? null : String(newValue ?? ''),
            oldNumeric: isNumericField ? Number(oldValue) : null,
            newNumeric: isNumericField ? Number(newValue) : null,
            changeReason,
        };

        const [recorded] = await connection
            .insert(stockEditHistoryTable)
            .values(insertData)
            .returning();

        return recorded;
    }

    /**
     * Record multiple field changes at once.
     * Useful for batch updates.
     */
    static async recordMultipleEditHistory(params: {
        tx?: any;
        stockId: string;
        editedBy: string;
        changes: FieldChange[];
        changeReason?: string;
    }) {
        const { tx, stockId, editedBy, changes, changeReason } = params;

        const records = await Promise.all(
            changes.map(change =>
                this.recordEditHistory({
                    tx,
                    stockId,
                    editedBy,
                    fieldChanged: change.field,
                    oldValue: change.oldValue,
                    newValue: change.newValue,
                    changeReason,
                })
            )
        );

        return records;
    }

    /**
     * Get edit history for a specific stock record.
     */
    static async getEditHistory(stockId: string) {
        return await db
            .select()
            .from(stockEditHistoryTable)
            .where(eq(stockEditHistoryTable.stockId, stockId))
            .orderBy(stockEditHistoryTable.editedAt);
    }

    /**
     * Get edit history with user details included.
     */
    static async getEditHistoryWithUser(stockId: string) {
        const { userTable } = await import("../drizzle/schema/user");

        return await db
            .select({
                id: stockEditHistoryTable.id,
                stockId: stockEditHistoryTable.stockId,
                fieldChanged: stockEditHistoryTable.fieldChanged,
                oldValue: stockEditHistoryTable.oldValue,
                newValue: stockEditHistoryTable.newValue,
                oldNumeric: stockEditHistoryTable.oldNumeric,
                newNumeric: stockEditHistoryTable.newNumeric,
                changeReason: stockEditHistoryTable.changeReason,
                editedAt: stockEditHistoryTable.editedAt,
                editedBy: stockEditHistoryTable.editedBy,
                editedByName: userTable.fullName,
                editedByEmail: userTable.email,
            })
            .from(stockEditHistoryTable)
            .innerJoin(userTable, eq(stockEditHistoryTable.editedBy, userTable.id))
            .where(eq(stockEditHistoryTable.stockId, stockId))
            .orderBy(stockEditHistoryTable.editedAt);
    }
}
