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

        // Find the latest stock batch date
        let latestDate: string | null = null;
        for (const stock of allStocks) {
            if (latestDate === null || new Date(stock.stockBatchCreatedAt) > new Date(latestDate)) {
                latestDate = stock.stockBatchCreatedAt;
            }
        }

        // Create a map of unitId to pricePerQuantity from the latest batch
        const latestBatchPrices = new Map<string, number>();
        for (const stock of allStocks) {
            if (stock.stockBatchCreatedAt === latestDate) {
                latestBatchPrices.set(stock.unitId, stock.pricePerQuantity);
            }
        }

        // Return data for all units, using latest batch price or 0 if not found
        return units.map(unit => ({
            unitId: unit.id,
            pricePerQuantity: latestBatchPrices.get(unit.id) || 0
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
    const maintainsId = 'b43ebab5-07a2-4ac7-9ffa-70451fa5809e';
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
        const unitData = await generateUnitData(row.productId, "Khagan Outlet");
        await db.update(deliveryHistoryTable)
            .set({ latestUnitPriceData: unitData, updatedAt: getCurrentDate() })
            .where(eq(deliveryHistoryTable.id, row.id));

        console.log(`Updated latestUnitPriceData for delivery_history id=${row.id}`, unitData);
    }
    // console.log(rows);
})();