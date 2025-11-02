import { eq, and, gte, lte, sum, sql, inArray, lt, gt } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerDueTable } from "../drizzle/schema/customerDue";
import { PaymentMethod, paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { saleTable } from "../drizzle/schema/sale";
import { productTable } from "../drizzle/schema/product";
import { unitTable } from "../drizzle/schema/unit";
import { unitConversionTable } from "../drizzle/schema/unitConversion";
import { deliveryHistoryTable } from "../drizzle/schema/deliveryHistory";
import { stockTable } from "../drizzle/schema/stock";
import { dailyStockRecordTable } from "../drizzle/schema/dailyStockRecord";
import { productCategoryTable } from "../drizzle/schema/productCategory";
import { productCategoryInProductTable } from "../drizzle/schema/productCategoryInProduct";
import { FilterOptions, filterWithPaginate, PaginationOptions } from '../utils/filterWithPaginate';
import { StockBatchService } from "./stockBatch.service";

interface ProductItem {
    productName: string;
    discount: number;
    discountType: "Fixed" | "Percentage";
    price_per_quantity: number;
    quantity: number;
    unit: string;
    stock: number;
    productId: string;
    discountNote: string;
    stockBatchId: string;
    unitId: string;
}

interface PaymentInfo {
    method: string;
    amount: number;
}

interface SaleRequest {
    maintainsId: string;
    products: ProductItem[];
    totalQuantity: number;
    totalPriceWithoutDiscount: number;
    totalDiscount: number;
    totalPriceWithDiscount: number;
    paymentInfo: PaymentInfo[];
    customerId?: string;
    customerCategoryId?: string;
}

export class SaleService {
    static async createSale(saleData: SaleRequest, userId: string) {
        return await db.transaction(async (tx) => {
            try {
                // First, process the multi-batch sale to reduce stock quantities
                const saleItems = saleData.products.map(product => ({
                    stockBatchId: product.stockBatchId,
                    unitId: product.unitId,
                    quantity: product.quantity
                }));

                // Process stock reduction using the multi-batch sale service
                await StockBatchService.processMultiBatchSale(saleItems);

                const saleIds: string[] = [];

                // Process each product in the sale to create sale records
                for (const product of saleData.products) {
                    // Calculate sale amount based on discount type
                    let saleAmount: number;
                    const discount = product.discount || 0;
                    const discountType = product.discountType || "Fixed";
                    
                    if (discountType === "Fixed") {
                        saleAmount = (product.quantity * product.price_per_quantity) - discount;
                    } else { // Percentage
                        saleAmount = (product.quantity * product.price_per_quantity) -
                            (product.quantity * product.price_per_quantity * discount / 100);
                    }

                    // Apply decimal precision formatting
                    const formattedSaleQuantity = Number(product.quantity.toFixed(3));
                    const formattedSaleAmount = Number(saleAmount.toFixed(2));
                    const formattedPricePerUnit = Number(product.price_per_quantity.toFixed(2));

                    // Calculate quantity in main unit
                    let quantityInMainUnit: number | null = null;
                    let mainUnitPrice: number | null = null;
                    
                    try {
                        // Get product's main unit
                        const [productInfo] = await tx.select({
                            mainUnitId: productTable.mainUnitId
                        })
                        .from(productTable)
                        .where(eq(productTable.id, product.productId));

                        if (productInfo?.mainUnitId) {
                            // Get main unit name
                            const [mainUnit] = await tx.select({
                                name: unitTable.name
                            })
                            .from(unitTable)
                            .where(eq(unitTable.id, productInfo.mainUnitId));

                            if (mainUnit) {
                                // Check if sale unit is the same as product's main unit
                                if (product.unit === mainUnit.name) {
                                    // Direct conversion: sale quantity is already in main unit
                                    quantityInMainUnit = formattedSaleQuantity;
                                } else {
                                    // Need to convert using unit conversion table
                                    // First, get the unit ID for the sale unit name
                                    const [saleUnit] = await tx.select({
                                        id: unitTable.id
                                    })
                                    .from(unitTable)
                                    .where(eq(unitTable.name, product.unit));

                                    if (saleUnit) {
                                        // Get the conversion factor
                                        const [conversion] = await tx.select({
                                            conversionFactor: unitConversionTable.conversionFactor
                                        })
                                        .from(unitConversionTable)
                                        .where(and(
                                            eq(unitConversionTable.productId, product.productId),
                                            eq(unitConversionTable.unitId, saleUnit.id)
                                        ));

                                        if (conversion) {
                                            // Convert to main unit: saleQuantity / conversionFactor
                                            quantityInMainUnit = Number((formattedSaleQuantity / conversion.conversionFactor).toFixed(3));
                                        }
                                    }
                                }
                            }

                            // Get main unit price from stock table
                            const [stockPrice] = await tx.select({
                                pricePerQuantity: stockTable.pricePerQuantity
                            })
                            .from(stockTable)
                            .where(and(
                                eq(stockTable.productId, product.productId),
                                eq(stockTable.maintainsId, saleData.maintainsId),
                                eq(stockTable.unitId, productInfo.mainUnitId),
                                eq(stockTable.stockBatchId, product.stockBatchId)
                            ));

                            if (stockPrice) {
                                mainUnitPrice = Number(stockPrice.pricePerQuantity.toFixed(2));
                            }
                        }
                    } catch (error) {
                        console.warn(`Failed to calculate quantity in main unit for product ${product.productId}:`, error);
                        // Continue with null value for quantityInMainUnit
                    }

                    // Create sale record
                    const [sale] = await tx.insert(saleTable).values({
                        createdBy: userId,
                        maintainsId: saleData.maintainsId,
                        customerCategoryId: saleData.customerCategoryId || null,
                        customerId: saleData.customerId || null,
                        productId: product.productId,
                        productName: product.productName,
                        discountType: discountType,
                        discountAmount: discount,
                        discountNote: product.discountNote || null,
                        saleQuantity: formattedSaleQuantity,
                        saleAmount: formattedSaleAmount,
                        pricePerUnit: formattedPricePerUnit,
                        unit: product.unit,
                        quantityInMainUnit: quantityInMainUnit,
                        mainUnitPrice: mainUnitPrice
                    }).returning();

                    saleIds.push(sale.id);
                }

                // Create payment record
                const paymentMethods: Record<PaymentMethod, number> = {
                    "bkash": 0,
                    "nogod": 0,
                    "cash": 0,
                    "due": 0,
                    "card": 0,
                    "sendForUse": 0
                };
                
                // Validate payment methods and accumulate amounts
                let totalPaymentAmount = 0;
                for (const payment of saleData.paymentInfo) {
                    if (!payment.method || typeof payment.amount !== 'number' || payment.amount < 0) {
                        throw new Error("Invalid payment method or amount");
                    }
                    
                    const method = payment.method as PaymentMethod;
                    if (!(method in paymentMethods)) {
                        throw new Error(`Invalid payment method: ${method}`);
                    }
                    
                    paymentMethods[method] += payment.amount;
                    totalPaymentAmount += payment.amount;
                }

                // Validate total payment amount matches sale total
                if (Math.abs(totalPaymentAmount - saleData.totalPriceWithDiscount) > 0.01) {
                    throw new Error(`Payment total (${totalPaymentAmount}) does not match sale total (${saleData.totalPriceWithDiscount})`);
                }

                // Check if due amount is present and validate customer ID
                const dueAmount = paymentMethods.due;
                if (dueAmount > 0 && !saleData.customerId) {
                    throw new Error("Customer ID is required when due amount is greater than 0");
                }

                // Create customer due record if due amount exists
                let customerDueId: string | null = null;
                if (dueAmount > 0 && saleData.customerId) {
                    const [customerDue] = await tx.insert(customerDueTable).values({
                        createdBy: userId,
                        customerId: saleData.customerId,
                        maintainsId: saleData.maintainsId,
                        totalAmount: dueAmount,
                        paidAmount: 0
                    }).returning();
                    customerDueId = customerDue.id;
                }

                const [payment] = await tx.insert(paymentTable).values({
                    maintainsId: saleData.maintainsId,
                    payments: paymentMethods,
                    totalAmount: Number(saleData.totalPriceWithDiscount.toFixed(2)),
                    customerDueId: customerDueId,
                    createdBy: userId
                }).returning();

                // Create junction table entries for payment-sale relationships
                const paymentSaleEntries = saleIds.map(saleId => ({
                    paymentId: payment.id,
                    saleId: saleId
                }));
                await tx.insert(paymentSaleTable).values(paymentSaleEntries);

                // After successful sale completion, clean up empty stock batches
                console.log('🧹 [SaleService] Starting post-sale stock batch cleanup');
                
                // Extract unique product-outlet combinations from the sale
                const saleItemsForCleanup = saleData.products.map(product => ({
                    productId: product.productId,
                    maintainsId: saleData.maintainsId
                }));

                // Perform cleanup outside the main transaction to avoid conflicts
                // This is done after the sale is committed to ensure data consistency
                setImmediate(async () => {
                    try {
                        const cleanupResult = await StockBatchService.cleanupEmptyStockBatchesAfterSale(saleItemsForCleanup);
                        console.log('✅ [SaleService] Stock batch cleanup completed:', cleanupResult);
                    } catch (cleanupError) {
                        console.error('❌ [SaleService] Stock batch cleanup failed:', cleanupError);
                        // Don't throw error here as the sale has already been completed successfully
                    }
                });

                return {
                    sales: saleIds,
                    payment: payment,
                    message: "Sale completed successfully"
                };

            } catch (error) {
                // Transaction will automatically rollback on error
                throw error;
            }
        });
    }

    static async getSales(
        pagination: PaginationOptions = {},
        filter: FilterOptions = {}
    ) {
        return await filterWithPaginate(saleTable, {
            pagination,
            filter,
            joins: [
                {
                    table: paymentSaleTable,
                    alias: 'paymentSale',
                    condition: eq(saleTable.id, paymentSaleTable.saleId),
                    type: 'left'
                },
                {
                    table: paymentTable,
                    alias: 'payment',
                    condition: eq(paymentSaleTable.paymentId, paymentTable.id),
                    type: 'left'
                }
            ],
            select: {
                // Sale fields
                id: saleTable.id,
                createdAt: saleTable.createdAt,
                updatedAt: saleTable.updatedAt,
                createdBy: saleTable.createdBy,
                maintainsId: saleTable.maintainsId,
                customerCategoryId: saleTable.customerCategoryId,
                customerId: saleTable.customerId,
                productId: saleTable.productId,
                productName: saleTable.productName,
                discountType: saleTable.discountType,
                discountAmount: saleTable.discountAmount,
                discountNote: saleTable.discountNote,
                saleQuantity: saleTable.saleQuantity,
                saleAmount: saleTable.saleAmount,
                pricePerUnit: saleTable.pricePerUnit,
                unit: saleTable.unit,
                // Payment fields
                paymentId: paymentTable.id,
                paymentCreatedAt: paymentTable.createdAt,
                paymentMethods: paymentTable.payments,
                totalPaymentAmount: paymentTable.totalAmount,
                customerDueId: paymentTable.customerDueId
            }
        });
    }

    static async getSaleById(id: string) {
        const [sale] = await db.select().from(saleTable).where(eq(saleTable.id, id));
        return sale;
    }

    // Helper function to get all category IDs including children recursively
    public static async getAllCategoryIds(targetCategoryId: string): Promise<string[]> {
        const categoryIds = new Set<string>();
        const toProcess = [targetCategoryId];
        
        while (toProcess.length > 0) {
            const currentId = toProcess.pop()!;
            if (categoryIds.has(currentId)) continue;
            
            categoryIds.add(currentId);
            
            // Find all child categories
            const children = await db
                .select({ id: productCategoryTable.id })
                .from(productCategoryTable)
                .where(eq(productCategoryTable.parentId, currentId));
            
            children.forEach(child => {
                if (!categoryIds.has(child.id)) {
                    toProcess.push(child.id);
                }
            });
        }
        
        return Array.from(categoryIds);
    }

    static async getDailyReportData(date: string, maintainsId: string, isDummy: boolean = false, reduceSalePercentage?: number) {
        try {
            // Parse the input date (which represents start of day in Dhaka time as UTC)
            const inputDate = new Date(date);
            
            // The input date is already the start of the day in Dhaka time (converted to UTC)
            // For example: "2025-10-29T18:00:00.000Z" = Oct 30, 2025 00:00:00 Dhaka time
            const startDate = new Date(inputDate);
            
            // Create end date: add 24 hours to get the end of the day in Dhaka time
            const endDate = new Date(inputDate.getTime() + 24 * 60 * 60 * 1000);
            
            console.log(`Date filtering: Input=${date}, Start=${startDate.toISOString()}, End=${endDate.toISOString()}`);

            // Get all category IDs (including children) for filtering
            const targetCategoryId = "cd9e69b0-8601-4f91-b121-46386eeb2c00";
            const allCategoryIds = await this.getAllCategoryIds(targetCategoryId);

            // 1. Fetch Order-Completed delivery history records
            const orderCompletedData = await db
                .select({
                    productId: deliveryHistoryTable.productId,
                    productName: productTable.name,
                    unitName: unitTable.name,
                    orderCompletedQuantity: deliveryHistoryTable.sentQuantity,
                    sku: productTable.sku
                })
                .from(deliveryHistoryTable)
                .innerJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
                .innerJoin(unitTable, eq(deliveryHistoryTable.unitId, unitTable.id))
                .innerJoin(productCategoryInProductTable, eq(productTable.id, productCategoryInProductTable.productId))
                .where(
                    and(
                        eq(deliveryHistoryTable.maintainsId, maintainsId),
                        eq(deliveryHistoryTable.status, "Order-Completed"),
                        gte(deliveryHistoryTable.sentAt, startDate),
                        lte(deliveryHistoryTable.sentAt, endDate),
                        inArray(productCategoryInProductTable.productCategoryId, allCategoryIds)
                    )
                );

            // 2. Fetch Return-Completed delivery history records
            const returnCompletedData = await db
                .select({
                    productId: deliveryHistoryTable.productId,
                    productName: productTable.name,
                    unitName: unitTable.name,
                    returnCompletedQuantity: deliveryHistoryTable.sentQuantity,
                    sku: productTable.sku
                })
                .from(deliveryHistoryTable)
                .innerJoin(productTable, eq(deliveryHistoryTable.productId, productTable.id))
                .innerJoin(unitTable, eq(deliveryHistoryTable.unitId, unitTable.id))
                .innerJoin(productCategoryInProductTable, eq(productTable.id, productCategoryInProductTable.productId))
                .where(
                    and(
                        eq(deliveryHistoryTable.maintainsId, maintainsId),
                        eq(deliveryHistoryTable.status, "Return-Completed"),
                        gte(deliveryHistoryTable.sentAt, startDate),
                        lte(deliveryHistoryTable.sentAt, endDate),
                        inArray(productCategoryInProductTable.productCategoryId, allCategoryIds)
                    )
                );

            // 3. Fetch aggregated sale data
            const saleData = await db
                .select({
                    productId: saleTable.productId,
                    productName: productTable.name,
                    mainUnitName: unitTable.name,
                    totalSoldQuantity: sql<number>`COALESCE(SUM(${saleTable.quantityInMainUnit}), 0)`,
                    totalSaleAmount: sum(saleTable.saleAmount),
                    avgMainUnitPrice: sql<number>`COALESCE(AVG(${saleTable.mainUnitPrice}), 0)`,
                    sku: productTable.sku
                })
                .from(saleTable)
                .innerJoin(productTable, eq(saleTable.productId, productTable.id))
                .leftJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
                .innerJoin(productCategoryInProductTable, eq(productTable.id, productCategoryInProductTable.productId))
                .where(
                    and(
                        eq(saleTable.maintainsId, maintainsId),
                        gte(saleTable.createdAt, startDate),
                        lte(saleTable.createdAt, endDate),
                        inArray(productCategoryInProductTable.productCategoryId, allCategoryIds)
                    )
                )
                .groupBy(saleTable.productId, productTable.name, unitTable.name, productTable.sku);

            // 4. Get all products with their main unit names filtered by category
            const allProductsWithMainUnit = await db
                .select({
                    productId: productTable.id,
                    productName: productTable.name,
                    mainUnitName: unitTable.name,
                    sku: productTable.sku
                })
                .from(productTable)
                .innerJoin(unitTable, eq(productTable.mainUnitId, unitTable.id))
                .innerJoin(productCategoryInProductTable, eq(productTable.id, productCategoryInProductTable.productId))
                .where(inArray(productCategoryInProductTable.productCategoryId, allCategoryIds));

            // 6. Gather keys for filtering stock data
            const productIds = new Set<string>();
            const unitNames = new Set<string>();

            // Collect productIds and unitNames from saleData
            saleData.forEach(item => {
                productIds.add(item.productId);
                if (item.mainUnitName) {
                    unitNames.add(item.mainUnitName);
                }
            });

            // Collect productIds and unitNames from allProductsWithMainUnit
            allProductsWithMainUnit.forEach(item => {
                productIds.add(item.productId);
                if (item.mainUnitName) {
                    unitNames.add(item.mainUnitName);
                }
            });

            const productIdsArray = Array.from(productIds);
            const unitNamesArray = Array.from(unitNames);

            // 6. Fetch aggregated stock data from daily_stock_record 
            const stockAggregates = await db
                .select({
                    productId: dailyStockRecordTable.productId,
                    unitName: unitTable.name,
                    totalQuantity: sql<number>`SUM(${dailyStockRecordTable.quantity})`,
                    totalPrice: sql<number>`SUM(${dailyStockRecordTable.quantity} * ${dailyStockRecordTable.pricePerQuantity})`
                })
                .from(dailyStockRecordTable)
                .innerJoin(unitTable, eq(dailyStockRecordTable.unitId, unitTable.id))
                .where(
                    and(
                        eq(dailyStockRecordTable.maintainsId, maintainsId),
                        gte(dailyStockRecordTable.createdAt, startDate),
                        lte(dailyStockRecordTable.createdAt, endDate),
                        inArray(dailyStockRecordTable.productId, productIdsArray),
                        inArray(unitTable.name, unitNamesArray)
                    )
                )
                .groupBy(dailyStockRecordTable.productId, unitTable.name);

                

            // 6.1. Fetch current stock data as fallback for mainUnitPrice
            const currentStockData = await db
                .select({
                    productId: stockTable.productId,
                    unitName: unitTable.name,
                    avgPricePerQuantity: sql<number>`AVG(${stockTable.pricePerQuantity})`
                })
                .from(stockTable)
                .innerJoin(unitTable, eq(stockTable.unitId, unitTable.id))
                .where(
                    and(
                        eq(stockTable.maintainsId, maintainsId),
                        inArray(stockTable.productId, productIdsArray),
                        inArray(unitTable.name, unitNamesArray)
                    )
                )
                .groupBy(stockTable.productId, unitTable.name);

            // 7. Create lookup maps for stock data and current stock prices
            const stockMap = new Map<string, { totalQuantity: number; totalPrice: number }>();
            stockAggregates.forEach(record => {
                const compositeKey = `${record.productId}::${record.unitName}`;
                stockMap.set(compositeKey, {
                    totalQuantity: Number(record.totalQuantity) || 0,
                    totalPrice: Number(record.totalPrice) || 0
                });
            });

            const currentStockPriceMap = new Map<string, number>();
            currentStockData.forEach(record => {
                const compositeKey = `${record.productId}::${record.unitName}`;
                currentStockPriceMap.set(compositeKey, Number(record.avgPricePerQuantity) || 0);
            });

            // 8. Start with ALL products as base dataset
            const combinedResults = new Map<string, any>();

            // Initialize ALL products first
            allProductsWithMainUnit.forEach(product => {
                combinedResults.set(product.productId, {
                    productId: product.productId,
                    productName: product.productName,
                    orderedCompletedQuantity: 0,
                    returnedCompletedQuantity: 0,
                    totalSoldQuantity: 0,
                    mainUnitName: product.mainUnitName,
                    mainUnitPrice: 0,
                    totalSaleAmount: 0,
                    sku: product.sku,
                    previousStockQuantity: 0,
                    previousStockTotalPrice: 0
                });
            });

            // Process order completed data
            orderCompletedData.forEach(item => {
                const existing = combinedResults.get(item.productId);
                if (existing) {
                    existing.orderedCompletedQuantity += Number(item.orderCompletedQuantity) || 0;
                }
            });

            // Process return completed data
            returnCompletedData.forEach(item => {
                const existing = combinedResults.get(item.productId);
                if (existing) {
                    existing.returnedCompletedQuantity += Number(item.returnCompletedQuantity) || 0;
                }
            });

            // Process sale data
            saleData.forEach(item => {
                const existing = combinedResults.get(item.productId);
                if (existing) {
                    existing.totalSoldQuantity = Number(item.totalSoldQuantity) || 0;
                    existing.mainUnitPrice = Number(item.avgMainUnitPrice) || 0;
                    existing.totalSaleAmount = Number(item.totalSaleAmount) || 0;

                    // Populate stock data from stockMap
                    if (item.mainUnitName) {
                        const compositeKey = `${item.productId}::${item.mainUnitName}`;
                        const stockData = stockMap.get(compositeKey);
                        if (stockData) {
                            existing.previousStockQuantity = stockData.totalQuantity;
                            existing.previousStockTotalPrice = stockData.totalPrice;
                        }
                    }
                }
            });

            // 9. Populate stock data and fallback mainUnitPrice for all products
            combinedResults.forEach((result, productId) => {
                const compositeKey = `${productId}::${result.mainUnitName}`;
                
                // Always try to populate stock data if not already set
                if (result.previousStockQuantity === 0 && result.previousStockTotalPrice === 0) {
                    const stockData = stockMap.get(compositeKey);
                    if (stockData) {
                        result.previousStockQuantity = stockData.totalQuantity;
                        result.previousStockTotalPrice = stockData.totalPrice;
                    }
                }
                
                // If no mainUnitPrice from sales, try to get it from stock data
                if (result.mainUnitPrice === 0 && result.mainUnitName) {
                    const stockData = stockMap.get(compositeKey);
                    if (stockData && stockData.totalQuantity > 0) {
                        // Calculate average price from daily stock if available
                        result.mainUnitPrice = stockData.totalPrice / stockData.totalQuantity;
                    }
                    
                    // If still no price, try current stock data as final fallback
                    if (result.mainUnitPrice === 0) {
                        const currentStockPrice = currentStockPriceMap.get(compositeKey);
                        if (currentStockPrice && currentStockPrice > 0) {
                            result.mainUnitPrice = currentStockPrice;
                        }
                    }
                }
            });

            // Convert map to array and apply custom SKU sorting
            const finalResults = Array.from(combinedResults.values());
            
            finalResults.sort((a, b) => {
                const skuA = a.sku || '';
                const skuB = b.sku || '';
                
                // Helper function to check if a string is purely numeric
                const isPurelyNumeric = (str: string): boolean => {
                    return /^\d+$/.test(str.trim());
                };
                
                const isNumericA = isPurelyNumeric(skuA);
                const isNumericB = isPurelyNumeric(skuB);
                
                // Case 1: Both are numeric - sort numerically
                if (isNumericA && isNumericB) {
                    return parseInt(skuA, 10) - parseInt(skuB, 10);
                }
                
                // Case 2: One numeric, one non-numeric - numeric comes first
                if (isNumericA && !isNumericB) {
                    return -1;
                }
                if (!isNumericA && isNumericB) {
                    return 1;
                }
                
                // Case 3: Both non-numeric - sort alphabetically
                return skuA.localeCompare(skuB);
            });

            // Apply dummy data reduction if requested
            if (isDummy && reduceSalePercentage) {
                finalResults.forEach(result => {
                    // Calculate reduction factor (e.g., 40% reduction means multiply by 0.6)
                    const reductionFactor = (100 - reduceSalePercentage) / 100;
                    
                    // Reduce totalSaleAmount
                    const reducedSaleAmount = result.totalSaleAmount * reductionFactor;
                    result.totalSaleAmount = Math.max(0, reducedSaleAmount); // Ensure not negative
                    
                    // Reduce totalSoldQuantity with unit-specific rounding
                    const reducedQuantity = result.totalSoldQuantity * reductionFactor;
                    const positiveReducedQuantity = Math.max(0, reducedQuantity); // Ensure not negative
                    
                    if (result.mainUnitName === "kg") {
                        // For kg: allow decimals, max 2 decimal places
                        result.totalSoldQuantity = Math.round(positiveReducedQuantity * 100) / 100;
                    } else if (result.mainUnitName === "piece" || result.mainUnitName === "box") {
                        // For piece/box: use Math.floor for integer values
                        result.totalSoldQuantity = Math.floor(positiveReducedQuantity);
                    } else {
                        // For other units: default to 2 decimal places
                        result.totalSoldQuantity = Math.round(positiveReducedQuantity * 100) / 100;
                    }
                });
            }

            // Convert map to array and return
            return finalResults;

        } catch (error) {
            console.error("Error fetching daily report data:", error);
            throw new Error("Failed to fetch daily report data");
        }
    }
}