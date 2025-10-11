import { ProductService } from './src/api/v1/service/product.service';
import { and, eq } from 'drizzle-orm';
import { db } from './src/api/v1/drizzle/db';
import { deliveryHistoryTable } from './src/api/v1/drizzle/schema/deliveryHistory';
import { getCurrentDate } from './src/api/v1/utils/timezone';

(async () => {
    const generateUnitData = async (productId: string, outletName: string) => (
        (await ProductService.getProductById(productId))?.['stocks']?.[outletName]?.map((item) => {
            return { unitId: item.unitId || "", pricePerQuantity: item.pricePerQuantity || 0 };
        }) || []
    );
    // Select all rows from deliveryHistoryTable where
    // status = 'Order-Placed' and maintains_id = '5cf2c18d-8738-4d95-ad56-edeeab190fba'
    const maintainsId = 'dece9f86-08ca-4a0a-94b6-01d06c92cd48';
    const rows = await db
        .select()
        .from(deliveryHistoryTable)
        .where(
            and(
                eq(deliveryHistoryTable.status, 'Order-Placed'),
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