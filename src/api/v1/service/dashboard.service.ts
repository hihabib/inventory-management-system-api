import { eq, and, gte, lte, desc, sql, count, sum } from "drizzle-orm";
import { db } from "../drizzle/db";
import { paymentTable } from "../drizzle/schema/payment";
import { saleTable } from "../drizzle/schema/sale";
import { productTable } from "../drizzle/schema/product";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";

interface WeeklySalesData {
    day: string;
    sales: number;
    barPoint: number;
}

interface TopSellingProduct {
    name: string;
    category: string;
    sold: number;
    revenue: number;
}

interface DashboardData {
    totalTransactions: number;
    totalSales: number;
    totalProducts: number;
    totalSalePayment: number;
    weeklySales: WeeklySalesData[];
    topSellingProducts: TopSellingProduct[];
}

export class DashboardService {
    static async getDashboardData(): Promise<DashboardData> {
        // Get current month start and end dates
        const now = new Date();
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Get total counts for current month
        const [transactionCount] = await db.select({ count: count() })
            .from(paymentTable)
            .where(and(
                gte(paymentTable.createdAt, currentMonthStart),
                lte(paymentTable.createdAt, currentMonthEnd)
            ));
        const [saleCount] = await db.select({ count: count() })
            .from(saleTable)
            .where(and(
                gte(saleTable.createdAt, currentMonthStart),
                lte(saleTable.createdAt, currentMonthEnd)
            ));
        const [productCount] = await db.select({ count: count() })
            .from(productTable)
            .where(and(
                gte(productTable.createdAt, currentMonthStart),
                lte(productTable.createdAt, currentMonthEnd)
            ));
        const [totalPayment] = await db.select({ total: sum(paymentTable.totalAmount) })
            .from(paymentTable)
            .where(and(
                gte(paymentTable.createdAt, currentMonthStart),
                lte(paymentTable.createdAt, currentMonthEnd)
            ));

        // Get last 7 days sales data
        const weeklySales = await this.getWeeklySalesData();

        // Get top 5 selling products
        const topSellingProducts = await this.getTopSellingProducts();

        return {
            totalTransactions: transactionCount.count,
            totalSales: saleCount.count,
            totalProducts: productCount.count,
            totalSalePayment: Number(totalPayment.total) || 0,
            weeklySales,
            topSellingProducts
        };
    }

    private static async getWeeklySalesData(): Promise<WeeklySalesData[]> {
        const today = new Date();
        const sevenDaysAgo = new Date(today);
        sevenDaysAgo.setDate(today.getDate() - 6);
        
        // Set time to start of day for sevenDaysAgo and end of day for today
        sevenDaysAgo.setHours(0, 0, 0, 0);
        today.setHours(23, 59, 59, 999);

        const salesData = await db
            .select({
                date: sql<string>`DATE(${saleTable.createdAt})`,
                totalSales: sql<number>`COALESCE(SUM(${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .where(
                and(
                    gte(saleTable.createdAt, sevenDaysAgo),
                    lte(saleTable.createdAt, today)
                )
            )
            .groupBy(sql`DATE(${saleTable.createdAt})`)
            .orderBy(sql`DATE(${saleTable.createdAt})`);

        // Create array for last 7 days with day names
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weeklySales: WeeklySalesData[] = [];

        // First pass: collect all sales data
        const salesValues: number[] = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dateString = date.toISOString().split('T')[0];
            
            const salesForDay = salesData.find(sale => sale.date === dateString);
            const salesAmount = salesForDay ? Number(salesForDay.totalSales) : 0;
            salesValues.push(salesAmount);
        }

        // Find maximum sales value for scaling
        const maxSales = Math.max(...salesValues);
        
        // Second pass: create final array with barPoint calculations
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const dayName = dayNames[date.getDay()];
            const salesAmount = salesValues[6 - i];
            
            // Calculate barPoint: scale sales to fit within 1000
            const barPoint = maxSales > 0 ? Math.round((salesAmount / maxSales) * 1000) : 0;
            
            weeklySales.push({
                day: dayName,
                sales: salesAmount,
                barPoint: barPoint
            });
        }

        return weeklySales;
    }

    private static async getTopSellingProducts(): Promise<TopSellingProduct[]> {
        const topProducts = await db
            .select({
                productId: saleTable.productId,
                productName: saleTable.productName,
                totalQuantity: sql<number>`SUM(${saleTable.saleQuantity})`,
                totalRevenue: sql<number>`SUM(${saleTable.saleAmount})`
            })
            .from(saleTable)
            .groupBy(saleTable.productId, saleTable.productName)
            .orderBy(desc(sql`SUM(${saleTable.saleQuantity})`), desc(sql`SUM(${saleTable.saleAmount})`))
            .limit(5);

        // Get category information for each product
        const topSellingProducts: TopSellingProduct[] = [];
        
        for (const product of topProducts) {
            // Get category for this product
            const categoryResult = await db
                .select({
                    categoryName: productCategoryTable.name
                })
                .from(productCategoryInProductTable)
                .innerJoin(
                    productCategoryTable,
                    eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id)
                )
                .where(eq(productCategoryInProductTable.productId, product.productId))
                .limit(1);

            topSellingProducts.push({
                name: product.productName,
                category: categoryResult.length > 0 ? categoryResult[0].categoryName : 'Uncategorized',
                sold: Number(product.totalQuantity),
                revenue: Number(product.totalRevenue)
            });
        }

        return topSellingProducts;
    }
}