import { and, count, desc, eq, gte, lte, sql, sum, inArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { productTable } from "../drizzle/schema/product";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { saleTable } from "../drizzle/schema/sale";
import { customerTable } from "../drizzle/schema/customer";
import { getCurrentDate } from "../utils/timezone";

interface DashboardFilters {
    start: string;
    end: string;
    maintainsIds?: string[];
    customerCategoryIds?: string[];
}

interface SaleGraphPoint {
    date: string;
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
    saleDataGraphReport: SaleGraphPoint[];
    topSellingProducts: TopSellingProduct[];
}

export class DashboardService {
    static async getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
        const startDate = new Date(filters.start);
        const endDate = new Date(filters.end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Invalid 'start' or 'end' date");
        }

        const maintainsIds = Array.isArray(filters.maintainsIds) && filters.maintainsIds.length > 0
            ? filters.maintainsIds
            : undefined;
        const categoryIds = Array.isArray(filters.customerCategoryIds) && filters.customerCategoryIds.length > 0
            ? filters.customerCategoryIds
            : undefined;

        // Resolve payment IDs filtered by maintains, date range and optional customer category filter via joins
        const paymentsFilteredRows = await db
            .select({
                paymentId: paymentTable.id,
                totalAmount: paymentTable.totalAmount
            })
            .from(paymentTable)
            .leftJoin(paymentSaleTable, eq(paymentTable.id, paymentSaleTable.paymentId))
            .leftJoin(saleTable, eq(paymentSaleTable.saleId, saleTable.id))
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(and(
                gte(paymentTable.createdAt, startDate),
                lte(paymentTable.createdAt, endDate),
                maintainsIds ? inArray(paymentTable.maintainsId, maintainsIds) : sql`true`,
                categoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, categoryIds) : sql`true`
            ));

        const uniquePaymentIds = Array.from(new Set(paymentsFilteredRows.map(r => r.paymentId)));
        const totalPaymentAmount = paymentsFilteredRows
            .reduce((acc, r) => acc + Number(r.totalAmount || 0), 0);

        // transactionCount = distinct payment IDs count
        const transactionCountValue = uniquePaymentIds.length;

        // saleCount with date, maintains and category filters
        const [saleCountRow] = await db
            .select({
                count: sql<number>`COUNT(*)`
            })
            .from(saleTable)
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(and(
                gte(saleTable.createdAt, startDate),
                lte(saleTable.createdAt, endDate),
                maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
                categoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, categoryIds) : sql`true`
            ));

        // productCount filtered only by date range (no maintains/customerCategory relation)
        const [productCountRow] = await db
            .select({ count: count() })
            .from(productTable)
            .where(and(
                gte(productTable.createdAt, startDate),
                lte(productTable.createdAt, endDate)
            ));

        // Sales graph data for the date range with filters
        const saleDataGraphReport = await this.getSaleDataGraphReport(startDate, endDate, maintainsIds, categoryIds);

        const topSellingProducts = await this.getTopSellingProducts();

        return {
            totalTransactions: Number(transactionCountValue || 0),
            totalSales: Number(saleCountRow?.count ?? 0),
            totalProducts: Number(productCountRow?.count ?? 0),
            totalSalePayment: Number(totalPaymentAmount || 0),
            saleDataGraphReport,
            topSellingProducts
        };
    }

    private static async getSaleDataGraphReport(
        startDate: Date,
        endDate: Date,
        maintainsIds?: string[],
        customerCategoryIds?: string[]
    ): Promise<SaleGraphPoint[]> {
        const salesData = await db
            .select({
                date: sql<string>`DATE(${saleTable.createdAt})`,
                totalSales: sql<number>`COALESCE(SUM(${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(and(
                gte(saleTable.createdAt, startDate),
                lte(saleTable.createdAt, endDate),
                maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
                customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`
            ))
            .groupBy(sql`DATE(${saleTable.createdAt})`)
            .orderBy(sql`DATE(${saleTable.createdAt})`);

        // Build continuous date range
        const points: SaleGraphPoint[] = [];
        const dayMillis = 24 * 60 * 60 * 1000;
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);

        const salesByDate: Record<string, number> = {};
        salesData.forEach(row => {
            salesByDate[row.date] = Number(row.totalSales || 0);
        });

        for (let t = start.getTime(); t <= end.getTime(); t += dayMillis) {
            const d = new Date(t);
            const key = d.toISOString().split('T')[0];
            const value = salesByDate[key] ?? 0;
            points.push({
                date: d.toLocaleDateString(),
                sales: Number(value.toFixed(2)),
                barPoint: 0 // to be populated after scaling
            });
        }

        const maxSales = points.reduce((m, p) => Math.max(m, p.sales), 0);
        points.forEach(p => {
            p.barPoint = maxSales > 0 ? Math.round((p.sales / maxSales) * 1000) : 0;
        });

        return points;
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
