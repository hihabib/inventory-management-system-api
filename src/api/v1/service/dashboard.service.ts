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
import { maintainsTable } from "../drizzle/schema/maintains";
import { unitTable } from "../drizzle/schema/unit";
import { userTable } from "../drizzle/schema/user";

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

interface UnitInfo {
    id: string;
    name: string;
    description: string;
}

interface UserInfo {
    id: string;
    fullName: string;
    email: string;
}

interface AddedProduct {
    name: string;
    sku: string;
    mainUnit: UnitInfo | null;
    createdAt: string;
    createdBy: UserInfo | null;
}

interface DashboardData {
    totalTransactions: number;
    totalSales: number;
    totalProducts: number;
    saleDataGraphReport: SaleGraphPoint[];
    topSellingProducts: TopSellingProduct[];
    addedProducts: AddedProduct[];
}

export class DashboardService {
    static async getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
        const startDate = new Date(filters.start);
        const endDate = new Date(filters.end);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            throw new Error("Invalid 'start' or 'end' date");
        }

        let maintainsIds = Array.isArray(filters.maintainsIds) && filters.maintainsIds.length > 0
            ? filters.maintainsIds
            : undefined;
        
        if (!maintainsIds) {
            const outletMaintains = await db
                .select({ id: maintainsTable.id })
                .from(maintainsTable)
                .where(eq(maintainsTable.type, 'Outlet'));
            
            maintainsIds = outletMaintains.map(m => m.id);
        }

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
        
        // transactionCount = distinct payment IDs count
        const transactionCountValue = uniquePaymentIds.length;

        // saleCount with date, maintains and category filters
        const [saleTotalRow] = await db
            .select({
                totalSales: sql<number>`COALESCE(SUM(${saleTable.saleAmount}), 0)`
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

        const topSellingProducts = await this.getTopSellingProducts(startDate, endDate, maintainsIds, categoryIds);

        const addedProducts = await this.getAddedProducts(startDate, endDate);

        return {
            totalTransactions: Number(transactionCountValue || 0),
            totalSales: Number(saleTotalRow?.totalSales ?? 0),
            totalProducts: Number(productCountRow?.count ?? 0),
            saleDataGraphReport,
            topSellingProducts,
            addedProducts
        };
    }

    private static async getAddedProducts(startDate: Date, endDate: Date): Promise<AddedProduct[]> {
        const products = await db
            .select({
                name: productTable.name,
                sku: productTable.sku,
                createdAt: productTable.createdAt,
                userFullName: userTable.fullName,
                userEmail: userTable.email,
                userId: userTable.id,
                unitId: unitTable.id,
                unitName: unitTable.name,
                unitDescription: unitTable.description
            })
            .from(productTable)
            .leftJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
            .leftJoin(userTable, eq(productTable.createdBy, userTable.id))
            .where(and(
                gte(productTable.createdAt, startDate),
                lte(productTable.createdAt, endDate)
            ))
            .orderBy(desc(productTable.createdAt));

        return products.map(p => ({
            name: p.name,
            sku: p.sku || "",
            createdAt: p.createdAt.toISOString(),
            mainUnit: p.unitId ? {
                id: p.unitId,
                name: p.unitName,
                description: p.unitDescription || ""
            } : null,
            createdBy: p.userId ? {
                id: p.userId,
                fullName: p.userFullName,
                email: p.userEmail
            } : null
        }));
    }

    private static async getSaleDataGraphReport(
        startDate: Date,
        endDate: Date,
        maintainsIds?: string[],
        customerCategoryIds?: string[]
    ): Promise<SaleGraphPoint[]> {
        const salesData = await db
            .select({
                date: sql<string>`DATE(${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka')`,
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
            .groupBy(sql`DATE(${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka')`)
            .orderBy(sql`DATE(${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka')`);

        const salesByDate: Record<string, number> = {};
        salesData.forEach(row => {
            salesByDate[row.date] = Number(row.totalSales || 0);
        });

        const points: SaleGraphPoint[] = [];
        const timeZone = 'Asia/Dhaka';
        const dateFormatter = new Intl.DateTimeFormat('en-CA', { 
            timeZone, 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit' 
        });

        const startStr = dateFormatter.format(startDate);
        const endStr = dateFormatter.format(endDate);
        
        const parseDate = (s: string) => {
            const [y, m, d] = s.split('-').map(Number);
            return new Date(Date.UTC(y, m - 1, d));
        }

        const current = parseDate(startStr);
        const end = parseDate(endStr);

        while (current <= end) {
            const dateKey = current.toISOString().split('T')[0];
            const value = salesByDate[dateKey] ?? 0;
            
            const [y, m, d] = dateKey.split('-');
            const displayDate = `${Number(m)}/${Number(d)}/${y}`;

            points.push({
                date: displayDate,
                sales: Number(value.toFixed(2)),
                barPoint: 0
            });
            
            current.setUTCDate(current.getUTCDate() + 1);
        }

        const maxSales = points.reduce((m, p) => Math.max(m, p.sales), 0);
        points.forEach(p => {
            p.barPoint = maxSales > 0 ? Math.round((p.sales / maxSales) * 1000) : 0;
        });

        return points;
    }

    private static async getTopSellingProducts(
        startDate: Date,
        endDate: Date,
        maintainsIds?: string[],
        customerCategoryIds?: string[]
    ): Promise<TopSellingProduct[]> {
        const SPECIAL_MAINTAINS_ID = "1160ad56-ac12-4034-8091-ae60c31eb624";
        const shouldRestrictToOutlet = !maintainsIds || !maintainsIds.includes(SPECIAL_MAINTAINS_ID);

        const topProducts = await db
            .select({
                productId: saleTable.productId,
                productName: saleTable.productName,
                totalQuantity: sql<number>`SUM(${saleTable.saleQuantity})`,
                totalRevenue: sql<number>`SUM(${saleTable.saleAmount})`
            })
            .from(saleTable)
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .leftJoin(maintainsTable, eq(saleTable.maintainsId, maintainsTable.id))
            .where(and(
                gte(saleTable.createdAt, startDate),
                lte(saleTable.createdAt, endDate),
                maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
                customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`,
                shouldRestrictToOutlet ? eq(maintainsTable.type, 'Outlet') : sql`true`
            ))
            .groupBy(saleTable.productId, saleTable.productName)
            .orderBy(desc(sql`SUM(${saleTable.saleQuantity})`), desc(sql`SUM(${saleTable.saleAmount})`))
            // .limit(5);

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
