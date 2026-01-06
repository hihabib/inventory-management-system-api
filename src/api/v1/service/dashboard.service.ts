import { and, count, desc, eq, gte, lte, sql, inArray, notInArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { productTable } from "../drizzle/schema/product";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { saleTable } from "../drizzle/schema/sale";
import { customerTable } from "../drizzle/schema/customer";
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
    // Helper to get excluded product IDs (Non-selling products)
    private static async getExcludedProductIds(): Promise<string[]> {
        const excludedCategoryId = "7fc57497-4215-452c-b292-9bedc540f652";
        const products = await db
            .select({ id: productCategoryInProductTable.productId })
            .from(productCategoryInProductTable)
            .where(eq(productCategoryInProductTable.productCategoryId, excludedCategoryId));
        return products.map(p => p.id);
    }

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

        const excludedProductIds = await this.getExcludedProductIds();

        // Resolve payment IDs filtered by maintains, date range and optional customer category filter via joins
        let paymentWhereCondition = and(
            gte(paymentTable.createdAt, startDate),
            lte(paymentTable.createdAt, endDate),
            maintainsIds ? inArray(paymentTable.maintainsId, maintainsIds) : sql`true`,
            categoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, categoryIds) : sql`true`
        );

        if (excludedProductIds.length > 0) {
            const paymentsWithExcludedProducts = db
                .select({ id: paymentSaleTable.paymentId })
                .from(paymentSaleTable)
                .innerJoin(saleTable, eq(paymentSaleTable.saleId, saleTable.id))
                .where(inArray(saleTable.productId, excludedProductIds));
            
            paymentWhereCondition = and(
                paymentWhereCondition,
                notInArray(paymentTable.id, paymentsWithExcludedProducts)
            );
        }

        const paymentsFilteredRows = await db
            .select({
                paymentId: paymentTable.id,
                totalAmount: paymentTable.totalAmount
            })
            .from(paymentTable)
            .leftJoin(paymentSaleTable, eq(paymentTable.id, paymentSaleTable.paymentId))
            .leftJoin(saleTable, eq(paymentSaleTable.saleId, saleTable.id))
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(paymentWhereCondition);

        const uniquePaymentIds = Array.from(new Set(paymentsFilteredRows.map(r => r.paymentId)));
        
        // transactionCount = distinct payment IDs count
        const transactionCountValue = uniquePaymentIds.length;

        // saleCount with date, maintains and category filters
        let saleWhereCondition = and(
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            categoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, categoryIds) : sql`true`
        );

        if (excludedProductIds.length > 0) {
            saleWhereCondition = and(saleWhereCondition, notInArray(saleTable.productId, excludedProductIds));
        }

        const [saleTotalRow] = await db
            .select({
                totalSales: sql<number>`COALESCE(SUM(${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(saleWhereCondition);

        // productCount filtered only by date range (no maintains/customerCategory relation)
        let productWhereCondition = and(
            gte(productTable.createdAt, startDate),
            lte(productTable.createdAt, endDate)
        );

        if (excludedProductIds.length > 0) {
            productWhereCondition = and(productWhereCondition, notInArray(productTable.id, excludedProductIds));
        }

        const [productCountRow] = await db
            .select({ count: count() })
            .from(productTable)
            .where(productWhereCondition);

        // Sales graph data for the date range with filters
        const saleDataGraphReport = await this.getSaleDataGraphReport(startDate, endDate, maintainsIds, categoryIds, excludedProductIds);

        const topSellingProducts = await this.getTopSellingProducts(startDate, endDate, maintainsIds, categoryIds, excludedProductIds);

        const addedProducts = await this.getAddedProducts(startDate, endDate, excludedProductIds);

        return {
            totalTransactions: Number(transactionCountValue || 0),
            totalSales: Number(saleTotalRow?.totalSales ?? 0),
            totalProducts: Number(productCountRow?.count ?? 0),
            saleDataGraphReport,
            topSellingProducts,
            addedProducts
        };
    }

    private static async getAddedProducts(startDate: Date, endDate: Date, excludedProductIds: string[] = []): Promise<AddedProduct[]> {
        let whereCondition = and(
            gte(productTable.createdAt, startDate),
            lte(productTable.createdAt, endDate)
        );

        if (excludedProductIds.length > 0) {
            whereCondition = and(whereCondition, notInArray(productTable.id, excludedProductIds));
        }

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
            .where(whereCondition)
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
        customerCategoryIds?: string[],
        excludedProductIds: string[] = []
    ): Promise<SaleGraphPoint[]> {
        let whereCondition = and(
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`
        );

        if (excludedProductIds.length > 0) {
            whereCondition = and(whereCondition, notInArray(saleTable.productId, excludedProductIds));
        }

        const salesData = await db
            .select({
                date: sql<string>`DATE(${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka')`,
                totalSales: sql<number>`COALESCE(SUM(${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .leftJoin(customerTable, eq(saleTable.customerId, customerTable.id))
            .where(whereCondition)
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
        customerCategoryIds?: string[],
        excludedProductIds: string[] = []
    ): Promise<TopSellingProduct[]> {
        const SPECIAL_MAINTAINS_ID = "1160ad56-ac12-4034-8091-ae60c31eb624";
        const shouldRestrictToOutlet = !maintainsIds || !maintainsIds.includes(SPECIAL_MAINTAINS_ID);

        let whereCondition = and(
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`,
            shouldRestrictToOutlet ? eq(maintainsTable.type, 'Outlet') : sql`true`
        );

        if (excludedProductIds.length > 0) {
            whereCondition = and(whereCondition, notInArray(saleTable.productId, excludedProductIds));
        }

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
            .where(whereCondition)
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
