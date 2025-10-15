import { ProductService } from './src/api/v1/service/product.service';
import { and, eq } from 'drizzle-orm';
import { db } from './src/api/v1/drizzle/db';
import { deliveryHistoryTable } from './src/api/v1/drizzle/schema/deliveryHistory';
import { getCurrentDate } from './src/api/v1/utils/timezone';

(async () => {

    const getLatestUnitPricesFromLatestStockBatch = (allStocks: any[], units?: any[]): { unitId: string, pricePerQuantity: number }[] => {
        if (!units || units.length === 0) {
            return [];
        }

        if (!allStocks || allStocks.length === 0) {
            // If no stocks, return all units with pricePerQuantity 0
            return units.map(unit => ({
                unitId: unit.id,
                pricePerQuantity: 0
            }));
        }

        // Helper to normalize date/time comparisons
        const toTime = (d: any): number => {
            if (!d) return 0;
            try {
                return d instanceof Date ? d.getTime() : new Date(d).getTime();
            } catch {
                return 0;
            }
        };

        // Choose the latest stock by createdAt, then derive its batch id
        let latestStock: any | null = null;
        for (const stock of allStocks) {
            if (!stock) continue;
            if (latestStock === null || toTime(stock.stockBatchCreatedAt) > toTime(latestStock.stockBatchCreatedAt)) {
                latestStock = stock;
            }
        }

        if (!latestStock) {
            return units.map(unit => ({ unitId: unit.id, pricePerQuantity: 0 }));
        }

        const latestBatchId = latestStock.stockBatchId ?? latestStock.batchId ?? latestStock.stockBatch?.id ?? null;
        const latestTime = toTime(latestStock.stockBatchCreatedAt);

        // Get all stocks from the latest batch (prefer id matching; fallback to exact timestamp match)
        const latestBatchStocks = allStocks.filter(s => {
            const sBatchId = s?.stockBatchId ?? s?.batchId ?? s?.stockBatch?.id ?? null;
            if (latestBatchId && sBatchId) return sBatchId === latestBatchId;
            return toTime(s?.stockBatchCreatedAt) === latestTime;
        });

        // Create a map of unitId to pricePerQuantity from the latest batch
        const latestBatchPrices = new Map<string, number>();
        for (const stock of latestBatchStocks) {
            latestBatchPrices.set(stock.unitId, Number(stock.pricePerQuantity) || 0);
        }

        // Return data for all units, using latest batch price or 0 if not found
        return units.map(unit => ({
            unitId: unit.id,
            pricePerQuantity: latestBatchPrices.get(unit.id) ?? 0
        }));
    }
    const generateUnitData = async (productId: string, outletName: string) => {
        return getLatestUnitPricesFromLatestStockBatch(
            (await ProductService.getProductById(productId))?.['stocks']?.[outletName] || [],
            (await ProductService.getProductById(productId))?.['units'] || []
        );
    }

    // Select all rows from deliveryHistoryTable where
    // status = 'Order-Placed' and maintains_id = '5cf2c18d-8738-4d95-ad56-edeeab190fba'
    const maintainsId = 'dece9f86-08ca-4a0a-94b6-01d06c92cd48';
    const rows = await db
        .select()
        .from(deliveryHistoryTable)
        .where(
            and(
                eq(deliveryHistoryTable.status, 'Order-Shipped'),
                eq(deliveryHistoryTable.maintainsId, maintainsId)
            )
        );


    for (const row of rows) {
        const unitData = await generateUnitData(row.productId, "Zirabo Outlet");
        await db.update(deliveryHistoryTable)
            .set({ latestUnitPriceData: unitData, updatedAt: getCurrentDate() })
            .where(eq(deliveryHistoryTable.id, row.id));

        console.log(`Updated latestUnitPriceData for delivery_history id=${row.id}`, unitData);
    }
    // console.log(rows);
})();