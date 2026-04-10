import { and, count, desc, eq, gte, lte, lt, sql, inArray, notInArray } from "drizzle-orm";
import { db } from "../drizzle/db";
import { paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { productTable } from "../drizzle/schema/product";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { saleTable } from "../drizzle/schema/sale";
import { customerTable } from "../drizzle/schema/customer";
import { customerCategoryTable } from "../drizzle/schema/customerCategory";
import { maintainsTable } from "../drizzle/schema/maintains";
import { unitTable } from "../drizzle/schema/unit";
import { userTable } from "../drizzle/schema/user";
import { buildDayList, getSegmentIntersection } from "../utils/timezone";

interface DashboardFilters {
    start: string;
    end: string;
    maintainsIds?: string[];
    customerCategoryIds?: string[];
    productCategoryIds?: string[];
}

interface SaleGraphPoint {
    date: string;
    salesWithoutDiscount: number;
    sales: number;
    barPoint: number;
}

interface TopSellingProduct {
    name: string;
    category: string;
    categoryIds: string[];
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
    categoryIds: string[];
    categories: { id: string; name: string }[];
    mainUnit: UnitInfo | null;
    createdAt: string;
    createdBy: UserInfo | null;
}

interface DashboardData {
    totalTransactions: number;
    totalSalesWithoutDiscount: number;
    totalSales: number;
    totalProducts: number;
    saleDataGraphReport: SaleGraphPoint[];
    topSellingProducts: TopSellingProduct[];
    addedProducts: AddedProduct[];
}

export class DashboardService {
    /**
     * Recursively get all child category IDs for a given parent category ID
     * @param parentCategoryId - The parent category ID
     * @returns Array of child category IDs
     */
    private static async getAllChildCategories(parentCategoryId: string): Promise<string[]> {
        const childCategories = await db
            .select({ id: productCategoryTable.id })
            .from(productCategoryTable)
            .where(eq(productCategoryTable.parentId, parentCategoryId));

        const childIds: string[] = [];

        for (const child of childCategories) {
            childIds.push(child.id);
            // Recursively get children of this child
            const grandChildren = await this.getAllChildCategories(child.id);
            childIds.push(...grandChildren);
        }

        return childIds;
    }

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

        // Use the provided dates directly - user already accounts for shifted business day
        // Just extend end date slightly to ensure inclusive range
        const queryStart = startDate;
        const queryEnd = new Date(endDate.getTime() + 1); // +1ms to make range inclusive

        let maintainsIds = Array.isArray(filters.maintainsIds) && filters.maintainsIds.length > 0
            ? filters.maintainsIds
            : undefined;

        // Determine maintains type for filtering topSellingProducts and addedProducts
        let maintainsType: 'Outlet' | 'Production' | null = null;
        if (maintainsIds) {
            // Get the type of the first maintains (assuming all maintains in filter are same type)
            const maintainsResult = await db
                .select({ type: maintainsTable.type })
                .from(maintainsTable)
                .where(eq(maintainsTable.id, maintainsIds[0]))
                .limit(1);

            if (maintainsResult.length > 0) {
                maintainsType = maintainsResult[0].type as 'Outlet' | 'Production';
            }
        }

        // For topSellingProducts and addedProducts:
        // - If Outlet maintains filtered: only show Outlet items (cd9e69b0-8601-4f91-b121-46386eeb2c00)
        // - If Production maintains filtered: return empty arrays
        // - If no maintains filtered: only show Outlet items (cd9e69b0-8601-4f91-b121-46386eeb2c00)
        let productCategoryIdsForProducts: string[] | undefined;
        if (maintainsType === 'Outlet') {
            productCategoryIdsForProducts = ['cd9e69b0-8601-4f91-b121-46386eeb2c00']; // Outlet items category
        } else if (maintainsType === 'Production') {
            // Will return empty arrays for topSellingProducts and addedProducts
        } else {
            // No maintains filtered, default to Outlet items category
            productCategoryIdsForProducts = ['cd9e69b0-8601-4f91-b121-46386eeb2c00'];
        }

        // Expand product category IDs to include all child categories (hierarchical filtering)
        if (productCategoryIdsForProducts) {
            const allCategoryIds = new Set(productCategoryIdsForProducts);

            for (const categoryId of productCategoryIdsForProducts) {
                const childCategories = await this.getAllChildCategories(categoryId);
                childCategories.forEach(id => allCategoryIds.add(id));
            }

            productCategoryIdsForProducts = Array.from(allCategoryIds);
            console.log('[Dashboard] Expanded productCategoryIdsForProducts:', productCategoryIdsForProducts);
        }

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

        let productCategoryIds = Array.isArray(filters.productCategoryIds) && filters.productCategoryIds.length > 0
            ? filters.productCategoryIds
            : undefined;

        // Expand product category IDs to include all child categories (hierarchical filtering)
        if (productCategoryIds) {
            const allCategoryIds = new Set(productCategoryIds);

            for (const categoryId of productCategoryIds) {
                const childCategories = await this.getAllChildCategories(categoryId);
                childCategories.forEach(id => allCategoryIds.add(id));
            }

            productCategoryIds = Array.from(allCategoryIds);
            console.log('[Dashboard] Expanded productCategoryIds:', productCategoryIds);
        }

        const excludedProductIds = await this.getExcludedProductIds();

        // Get sale IDs filtered by product categories (if product category filter is provided)
        let filteredSaleIdsForCategories: Set<string> | null = null;
        if (productCategoryIds) {
            const salesWithCategories = await db
                .select({ id: saleTable.id })
                .from(saleTable)
                .innerJoin(
                    productCategoryInProductTable,
                    eq(saleTable.productId, productCategoryInProductTable.productId)
                )
                .where(
                    and(
                        gte(saleTable.createdAt, queryStart),
                        lte(saleTable.createdAt, queryEnd),
                        inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)
                    )
                );
            filteredSaleIdsForCategories = new Set(salesWithCategories.map(s => s.id));
        }

        // Get typed customer categories for the maintains (Outlet type)
        let typedCategoryIds = await db
            .select({ id: customerCategoryTable.id })
            .from(customerCategoryTable)
            .where(eq(customerCategoryTable.type, 'Outlet'))
            .then(categories => categories.map(c => c.id));

        // If user provided specific categoryIds, filter the typed categories to only those selected
        // This matches the money report's logic (sale.service.ts:613-614)
        if (categoryIds && categoryIds.length > 0) {
            typedCategoryIds = typedCategoryIds.filter(id => categoryIds.includes(id));
        }

        // Resolve payment IDs filtered by maintains, date range and optional customer category filter via joins
        let paymentWhereCondition = and(
            gte(paymentTable.createdAt, queryStart),
            lte(paymentTable.createdAt, queryEnd),
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

        // Filter payments to only include those that have sales matching the product categories
        if (filteredSaleIdsForCategories) {
            const paymentsWithFilteredSales = db
                .select({ paymentId: paymentSaleTable.paymentId })
                .from(paymentSaleTable)
                .where(inArray(paymentSaleTable.saleId, Array.from(filteredSaleIdsForCategories)));

            paymentWhereCondition = and(
                paymentWhereCondition,
                inArray(paymentTable.id, paymentsWithFilteredSales)
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
            gte(saleTable.createdAt, queryStart),
            lte(saleTable.createdAt, queryEnd),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            categoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, categoryIds) : sql`true`
        );

        if (excludedProductIds.length > 0) {
            saleWhereCondition = and(saleWhereCondition, notInArray(saleTable.productId, excludedProductIds));
        }

        // Filter by product categories
        if (filteredSaleIdsForCategories) {
            saleWhereCondition = and(saleWhereCondition, inArray(saleTable.id, Array.from(filteredSaleIdsForCategories)));
        }

        // For gross sales calculation, we need to match the money report's getTotalOutgoingProductPrice exactly:
        // 1. Uses lt(createdAt, endDate) instead of lte
        // 2. Uses inArray(customerCategoryId, typedCategoryIds) if available
        // 3. Uses inArray(maintainsId, maintainsIds) (same as dashboard)
        const grossSalesWhereConditions = [
            gte(saleTable.createdAt, queryStart),
            lt(saleTable.createdAt, queryEnd),  // Note: lt not lte
        ];

        if (maintainsIds) {
            grossSalesWhereConditions.push(inArray(saleTable.maintainsId, maintainsIds));
        }

        // Use categoryIds from request (if provided) to match money report's getTotalOutgoingProductPrice
        if (categoryIds && categoryIds.length > 0) {
            grossSalesWhereConditions.push(inArray(saleTable.customerCategoryId, categoryIds));
        }

        if (excludedProductIds.length > 0) {
            grossSalesWhereConditions.push(notInArray(saleTable.productId, excludedProductIds));
        }

        // Filter by product categories using EXISTS subquery
        if (productCategoryIds && productCategoryIds.length > 0) {
            grossSalesWhereConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        const grossSalesWhereCondition = and(...grossSalesWhereConditions);

        // For discount calculation, we need to match the money report's logic exactly:
        // 1. No customer table join
        // 2. No excluded products filter (money report passes [] for excludedProductIds)
        // 3. Simple customerCategoryId filter if categoryIds provided
        const discountWhereConditions = [
            gte(saleTable.createdAt, queryStart),
            lte(saleTable.createdAt, queryEnd)
        ];

        if (maintainsIds) {
            discountWhereConditions.push(inArray(saleTable.maintainsId, maintainsIds));
        }

        // Note: We DO filter by typed customer categories to match money report's getTotalDiscountByDate
        // The money report's getTotalDiscountByDate filters by eq(saleTable.customerCategoryId, customerCategoryId)
        // So sales with NULL customerCategoryId are excluded from discount calculation
        if (typedCategoryIds.length > 0) {
            discountWhereConditions.push(inArray(saleTable.customerCategoryId, typedCategoryIds));
        }

        // Filter by product categories using EXISTS subquery
        if (productCategoryIds && productCategoryIds.length > 0) {
            discountWhereConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        const discountWhereCondition = and(...discountWhereConditions);

        // Calculate grossSales using grossSalesWhereCondition (matches money report's getTotalOutgoingProductPrice)
        const [grossSalesResult] = await db
            .select({
                grossSales: sql<number>`COALESCE(SUM(${saleTable.saleQuantity} * ${saleTable.pricePerUnit}), 0)`
            })
            .from(saleTable)
            .where(grossSalesWhereCondition);

        // Calculate discount using discountWhereCondition (matches money report's getTotalDiscountByDate)
        const [discountResult] = await db
            .select({
                discount: sql<number>`COALESCE(SUM((${saleTable.saleQuantity} * ${saleTable.pricePerUnit}) - ${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .where(discountWhereCondition);

        // Calculate net sales: grossSales - discount (same as money report)
        const totalSales = (Number(grossSalesResult?.grossSales ?? 0) - Number(discountResult?.discount ?? 0));

        // productCount filtered only by date range (no maintains/customerCategory relation)
        let productWhereCondition = and(
            gte(productTable.createdAt, queryStart),
            lte(productTable.createdAt, queryEnd)
        );

        if (excludedProductIds.length > 0) {
            productWhereCondition = and(productWhereCondition, notInArray(productTable.id, excludedProductIds));
        }

        const [productCountRow] = await db
            .select({ count: count() })
            .from(productTable)
            .where(productWhereCondition);

        // Sales graph data for the date range with filters
        const saleDataGraphReport = await this.getSaleDataGraphReport(queryStart, queryEnd, maintainsIds, categoryIds, productCategoryIds, excludedProductIds);

        // For topSellingProducts and addedProducts, use the productCategoryIdsForProducts based on maintains type
        // Debug logging
        console.log('[Dashboard] Fetching topSellingProducts and addedProducts with:', {
            maintainsIds,
            maintainsType,
            productCategoryIdsForProducts,
            queryStart,
            queryEnd
        });

        const topSellingProducts = await this.getTopSellingProducts(
            queryStart,
            queryEnd,
            maintainsIds,
            categoryIds,
            productCategoryIdsForProducts, // Use maintains-aware product category IDs
            excludedProductIds,
            maintainsType // Pass maintains type to handle Production case
        );

        console.log('[Dashboard] topSellingProducts result:', topSellingProducts);

        const addedProducts = await this.getAddedProducts(
            queryStart,
            queryEnd,
            productCategoryIdsForProducts, // Use maintains-aware product category IDs
            excludedProductIds,
            maintainsType // Pass maintains type to handle Production case
        );

        console.log('[Dashboard] addedProducts result:', addedProducts);

        const grossSales = Number(grossSalesResult?.grossSales ?? 0);

        return {
            totalTransactions: Number(transactionCountValue || 0),
            totalSalesWithoutDiscount: grossSales,
            totalSales: totalSales,
            totalProducts: Number(productCountRow?.count ?? 0),
            saleDataGraphReport,
            topSellingProducts,
            addedProducts
        };
    }

    private static async getAddedProducts(
        startDate: Date,
        endDate: Date,
        productCategoryIds?: string[],
        excludedProductIds: string[] = [],
        maintainsType?: 'Outlet' | 'Production' | null
    ): Promise<AddedProduct[]> {
        // If Production maintains are filtered, return empty array
        if (maintainsType === 'Production') {
            return [];
        }

        let whereCondition = and(
            gte(productTable.createdAt, startDate),
            lte(productTable.createdAt, endDate)
        );

        if (excludedProductIds.length > 0) {
            whereCondition = and(whereCondition, notInArray(productTable.id, excludedProductIds));
        }

        // Filter by product categories if provided (for Outlet maintains)
        if (productCategoryIds && productCategoryIds.length > 0) {
            whereCondition = and(
                whereCondition,
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${productTable.id}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        const products = await db
            .select({
                id: productTable.id,
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

        // Get category IDs and names for all products
        const productIds = products.map(p => p.id);
        const productCategories = await db
            .select({
                productId: productCategoryInProductTable.productId,
                categoryId: productCategoryInProductTable.productCategoryId,
                categoryName: productCategoryTable.name
            })
            .from(productCategoryInProductTable)
            .innerJoin(
                productCategoryTable,
                eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id)
            )
            .where(inArray(productCategoryInProductTable.productId, productIds));

        // Create a map of product ID to categories
        const categoryMap = new Map<string, { ids: string[], categories: { id: string; name: string }[] }>();
        productCategories.forEach(pc => {
            if (!categoryMap.has(pc.productId)) {
                categoryMap.set(pc.productId, { ids: [], categories: [] });
            }
            categoryMap.get(pc.productId)!.ids.push(pc.categoryId);
            categoryMap.get(pc.productId)!.categories.push({ id: pc.categoryId, name: pc.categoryName });
        });

        return products.map(p => {
            const categories = categoryMap.get(p.id);
            return {
                name: p.name,
                sku: p.sku || "",
                categoryIds: categories?.ids || [],
                categories: categories?.categories || [],
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
            };
        });
    }

    private static async getSaleDataGraphReport(
        startDate: Date,
        endDate: Date,
        maintainsIds?: string[],
        customerCategoryIds?: string[],
        productCategoryIds?: string[],
        excludedProductIds: string[] = []
    ): Promise<SaleGraphPoint[]> {
        // Business day starts at 04:00 AM Dhaka time
        // Shift dates: any time before 04:00 AM belongs to previous business day
        let whereCondition = and(
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`,
            productCategoryIds ? sql`EXISTS (
                SELECT 1 FROM ${productCategoryInProductTable}
                WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
            )` : sql`true`
        );

        if (excludedProductIds.length > 0) {
            whereCondition = and(whereCondition, notInArray(saleTable.productId, excludedProductIds));
        }

        // Prepare where conditions for gross sales and discount calculations (matching money report logic)
        // Gross sales: uses lt(endDate), categoryIds filter, excluded products filter
        const grossSalesWhereConditions = [
            gte(saleTable.createdAt, startDate),
            lt(saleTable.createdAt, endDate)  // lt not lte
        ];

        if (maintainsIds) {
            grossSalesWhereConditions.push(inArray(saleTable.maintainsId, maintainsIds));
        }

        if (customerCategoryIds && customerCategoryIds.length > 0) {
            grossSalesWhereConditions.push(inArray(saleTable.customerCategoryId, customerCategoryIds));
        }

        if (excludedProductIds.length > 0) {
            grossSalesWhereConditions.push(notInArray(saleTable.productId, excludedProductIds));
        }

        // Filter by product categories using EXISTS subquery
        if (productCategoryIds && productCategoryIds.length > 0) {
            grossSalesWhereConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        // Discount: uses lte(endDate), typed categories filter, NO excluded products filter
        const discountWhereConditions = [
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate)
        ];

        if (maintainsIds) {
            discountWhereConditions.push(inArray(saleTable.maintainsId, maintainsIds));
        }

        // Get typed categories for discount calculation (same as in getDashboardData)
        let typedCategoryIds = await db
            .select({ id: customerCategoryTable.id })
            .from(customerCategoryTable)
            .where(eq(customerCategoryTable.type, 'Outlet'))
            .then(categories => categories.map(c => c.id));

        // If user provided specific categoryIds, filter the typed categories to only those selected
        if (customerCategoryIds && customerCategoryIds.length > 0) {
            typedCategoryIds = typedCategoryIds.filter(id => customerCategoryIds.includes(id));
        }

        if (typedCategoryIds.length > 0) {
            discountWhereConditions.push(inArray(saleTable.customerCategoryId, typedCategoryIds));
        }

        // Filter by product categories using EXISTS subquery
        if (productCategoryIds && productCategoryIds.length > 0) {
            discountWhereConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        // Calculate gross sales grouped by date
        const grossSalesData = await db
            .select({
                date: sql<string>`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`,
                grossSales: sql<number>`COALESCE(SUM(${saleTable.saleQuantity} * ${saleTable.pricePerUnit}), 0)`
            })
            .from(saleTable)
            .where(and(...grossSalesWhereConditions))
            .groupBy(sql`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`)
            .orderBy(sql`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`);

        // Calculate discount grouped by date
        const discountData = await db
            .select({
                date: sql<string>`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`,
                discount: sql<number>`COALESCE(SUM((${saleTable.saleQuantity} * ${saleTable.pricePerUnit}) - ${saleTable.saleAmount}), 0)`
            })
            .from(saleTable)
            .where(and(...discountWhereConditions))
            .groupBy(sql`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`)
            .orderBy(sql`DATE((${saleTable.createdAt} AT TIME ZONE 'Asia/Dhaka' - INTERVAL '4 hours') AT TIME ZONE 'Asia/Dhaka')`);

        // Combine gross sales and discount by date
        const grossSalesByDate: Record<string, number> = {};
        grossSalesData.forEach(row => {
            grossSalesByDate[row.date] = Number(row.grossSales || 0);
        });

        const discountByDate: Record<string, number> = {};
        discountData.forEach(row => {
            discountByDate[row.date] = Number(row.discount || 0);
        });

        // Calculate net sales: gross - discount
        const salesByDate: Record<string, number> = {};
        const allDates = new Set([...Object.keys(grossSalesByDate), ...Object.keys(discountByDate)]);
        allDates.forEach(date => {
            const gross = grossSalesByDate[date] || 0;
            const discount = discountByDate[date] || 0;
            salesByDate[date] = gross - discount;
        });

        // Build day list using shifted business day logic
        const days = buildDayList(startDate, endDate);
        const points: SaleGraphPoint[] = [];

        for (const day of days) {
            const grossValue = grossSalesByDate[day.key] ?? 0;
            const netValue = salesByDate[day.key] ?? 0;

            points.push({
                date: day.key,
                salesWithoutDiscount: Number(grossValue.toFixed(2)),
                sales: Number(netValue.toFixed(2)),
                barPoint: 0
            });
        }

        // Filter out dates that don't intersect with the query range OR have zero sales (both gross and net)
        // This prevents extra dates from appearing when query end date falls on next calendar day in Dhaka timezone
        const filteredPoints = points.filter(p => {
            // Exclude dates with zero sales (both gross and net are zero)
            if (p.salesWithoutDiscount === 0 && p.sales === 0) {
                return false;
            }
            // Also check that the date's business day intersects with the query range
            const [year, month, day] = p.date.split('-').map(Number);
            const intersection = getSegmentIntersection(startDate, endDate, year, month, day);
            return intersection !== null;
        });

        // Calculate barPoint based on filtered points (using gross sales for scale)
        const maxSales = filteredPoints.reduce((m, p) => Math.max(m, p.salesWithoutDiscount), 0);
        filteredPoints.forEach(p => {
            p.barPoint = maxSales > 0 ? Math.round((p.salesWithoutDiscount / maxSales) * 1000) : 0;
        });

        return filteredPoints;
    }

    private static async getTopSellingProducts(
        startDate: Date,
        endDate: Date,
        maintainsIds?: string[],
        customerCategoryIds?: string[],
        productCategoryIds?: string[],
        excludedProductIds: string[] = [],
        maintainsType?: 'Outlet' | 'Production' | null
    ): Promise<TopSellingProduct[]> {
        // If Production maintains are filtered, return empty array
        if (maintainsType === 'Production') {
            return [];
        }
        const SPECIAL_MAINTAINS_ID = "1160ad56-ac12-4034-8091-ae60c31eb624";
        const shouldRestrictToOutlet = !maintainsIds || !maintainsIds.includes(SPECIAL_MAINTAINS_ID);

        // Build where conditions
        const whereConditions = [
            gte(saleTable.createdAt, startDate),
            lte(saleTable.createdAt, endDate),
            maintainsIds ? inArray(saleTable.maintainsId, maintainsIds) : sql`true`,
            customerCategoryIds ? inArray(sql<string>`COALESCE(${saleTable.customerCategoryId}, ${customerTable.categoryId})`, customerCategoryIds) : sql`true`,
            shouldRestrictToOutlet ? eq(maintainsTable.type, 'Outlet') : sql`true`,
            excludedProductIds.length > 0 ? notInArray(saleTable.productId, excludedProductIds) : sql`true`
        ];

        // Add product category filter using EXISTS subquery
        if (productCategoryIds && productCategoryIds.length > 0) {
            whereConditions.push(
                sql`EXISTS (
                    SELECT 1 FROM ${productCategoryInProductTable}
                    WHERE ${productCategoryInProductTable.productId} = ${saleTable.productId}
                    AND ${inArray(productCategoryInProductTable.productCategoryId, productCategoryIds)}
                )`
            );
        }

        const whereCondition = and(...whereConditions);

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

        // Get all category IDs for the products
        const productIds = topProducts.map(p => p.productId);
        const productCategories = await db
            .select({
                productId: productCategoryInProductTable.productId,
                categoryId: productCategoryInProductTable.productCategoryId,
                categoryName: productCategoryTable.name
            })
            .from(productCategoryInProductTable)
            .innerJoin(
                productCategoryTable,
                eq(productCategoryInProductTable.productCategoryId, productCategoryTable.id)
            )
            .where(inArray(productCategoryInProductTable.productId, productIds));

        // Create a map of product ID to category IDs and category names
        const categoryMap = new Map<string, { ids: string[], names: string[] }>();
        productCategories.forEach(pc => {
            if (!categoryMap.has(pc.productId)) {
                categoryMap.set(pc.productId, { ids: [], names: [] });
            }
            categoryMap.get(pc.productId)!.ids.push(pc.categoryId);
            categoryMap.get(pc.productId)!.names.push(pc.categoryName);
        });

        // Build the result with category IDs
        const topSellingProducts: TopSellingProduct[] = [];
        for (const product of topProducts) {
            const categories = categoryMap.get(product.productId);
            topSellingProducts.push({
                name: product.productName,
                category: categories && categories.names.length > 0 ? categories.names[0] : 'Uncategorized',
                categoryIds: categories?.ids || [],
                sold: Number(product.totalQuantity),
                revenue: Number(product.totalRevenue)
            });
        }

        return topSellingProducts;
    }
}
