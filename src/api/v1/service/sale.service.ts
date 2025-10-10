import { eq } from "drizzle-orm";
import { db } from "../drizzle/db";
import { customerDueTable } from "../drizzle/schema/customerDue";
import { PaymentMethod, paymentTable } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { saleTable } from "../drizzle/schema/sale";
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
                        unit: product.unit
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
}