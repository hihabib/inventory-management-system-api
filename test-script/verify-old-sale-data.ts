import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../src/api/v1/drizzle/db";
import { saleTable } from "../src/api/v1/drizzle/schema/sale";
import { stockBatchTable } from "../src/api/v1/drizzle/schema/stockBatch";
import { unitTable } from "../src/api/v1/drizzle/schema/unit";

const DAYS_TO_CHECK = 5;

type SaleRow = {
    id: string;
    createdAt: Date;
    maintainsId: string;
    createdBy: string;
    productId: string | null;
    productName: string;
    unit: string;
    saleQuantity: number;
    saleAmount: number;
    pricePerUnit: number;
    saleUnitId: string | null;
    stockBatchId: string | null;
    quantityInMainUnit: number | null;
    mainUnitPrice: number | null;
};

async function backfillMissingSaleUnitIds(sales: SaleRow[]) {
    const targets = sales.filter(s => !s.saleUnitId && (s.unit ?? "").trim().length > 0);
    if (targets.length === 0) return { updated: 0, unresolved: 0 };

    const unitNames = Array.from(new Set(targets.map(t => t.unit.trim())));
    const units = await db
        .select({ id: unitTable.id, name: unitTable.name })
        .from(unitTable)
        .where(inArray(unitTable.name, unitNames));

    const unitIdByName = new Map<string, string>();
    for (const u of units) {
        if (!unitIdByName.has(u.name)) unitIdByName.set(u.name, u.id);
    }

    let updated = 0;
    let unresolved = 0;

    await db.transaction(async (tx) => {
        for (const sale of targets) {
            const unitId = unitIdByName.get(sale.unit.trim());
            if (!unitId) {
                unresolved++;
                continue;
            }
            await tx
                .update(saleTable)
                .set({ saleUnitId: unitId })
                .where(eq(saleTable.id, sale.id));
            updated++;
        }
    });

    return { updated, unresolved };
}

async function main() {
    const now = new Date();
    const since = new Date(now.getTime() - DAYS_TO_CHECK * 24 * 60 * 60 * 1000);

    const recentSales = await db
        .select({
            id: saleTable.id,
            createdAt: saleTable.createdAt,
            maintainsId: saleTable.maintainsId,
            createdBy: saleTable.createdBy,
            productId: saleTable.productId,
            productName: saleTable.productName,
            unit: saleTable.unit,
            saleQuantity: saleTable.saleQuantity,
            saleAmount: saleTable.saleAmount,
            pricePerUnit: saleTable.pricePerUnit,
            saleUnitId: saleTable.saleUnitId,
            stockBatchId: saleTable.stockBatchId,
            quantityInMainUnit: saleTable.quantityInMainUnit,
            mainUnitPrice: saleTable.mainUnitPrice
        })
        .from(saleTable)
        .where(gte(saleTable.createdAt, since))
        .orderBy(desc(saleTable.createdAt));

    console.log(JSON.stringify({
        windowDays: DAYS_TO_CHECK,
        since: since.toISOString(),
        now: now.toISOString(),
        rows: recentSales.length,
        newestCreatedAt: recentSales[0]?.createdAt ?? null,
        oldestCreatedAt: recentSales[recentSales.length - 1]?.createdAt ?? null
    }, null, 2));

    const sample = recentSales.slice(0, 50).map(r => ({
        id: r.id,
        createdAt: r.createdAt,
        maintainsId: r.maintainsId,
        productId: r.productId,
        productName: r.productName,
        unit: r.unit,
        saleQuantity: r.saleQuantity,
        saleAmount: r.saleAmount,
        saleUnitId: r.saleUnitId,
        stockBatchId: r.stockBatchId,
        quantityInMainUnit: r.quantityInMainUnit,
        mainUnitPrice: r.mainUnitPrice
    }));

    console.log(JSON.stringify({ sample }, null, 2));

    const missingSaleUnitIdCount = recentSales.filter(r => !r.saleUnitId).length;
    const missingStockBatchIdCount = recentSales.filter(r => !r.stockBatchId).length;

    const orphanBatchRefs = await db
        .select({
            count: sql<number>`COUNT(*)`
        })
        .from(saleTable)
        .leftJoin(stockBatchTable, eq(saleTable.stockBatchId, stockBatchTable.id))
        .where(and(
            gte(saleTable.createdAt, since),
            sql`${saleTable.stockBatchId} IS NOT NULL`,
            isNull(stockBatchTable.id)
        ));

    console.log(JSON.stringify({
        missingSaleUnitIdCount,
        missingStockBatchIdCount,
        orphanStockBatchReferenceCount: Number(orphanBatchRefs[0]?.count ?? 0)
    }, null, 2));

    if (missingSaleUnitIdCount > 0 || missingStockBatchIdCount > 0) {
        const missingSample = recentSales
            .filter(r => !r.saleUnitId || !r.stockBatchId)
            .slice(0, 25)
            .map(r => ({
                id: r.id,
                createdAt: r.createdAt,
                maintainsId: r.maintainsId,
                productId: r.productId,
                productName: r.productName,
                unit: r.unit,
                saleQuantity: r.saleQuantity,
                saleAmount: r.saleAmount,
                saleUnitId: r.saleUnitId,
                stockBatchId: r.stockBatchId
            }));
        console.log(JSON.stringify({ missingSample }, null, 2));
    }

    if (missingSaleUnitIdCount > 0) {
        const { updated, unresolved } = await backfillMissingSaleUnitIds(recentSales as SaleRow[]);
        console.log(JSON.stringify({ backfillSaleUnitId: { updated, unresolved } }, null, 2));
    }

    if (missingStockBatchIdCount > 0) {
        const ids = recentSales.filter(r => !r.stockBatchId).slice(0, 25).map(r => r.id);
        console.log(JSON.stringify({
            warning: "Some sales are missing stockBatchId; these cannot be fully reverted by payment cancellation.",
            sampleSaleIds: ids
        }, null, 2));
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
