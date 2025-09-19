import { eq, and } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewSale, saleTable } from "../drizzle/schema/sale";
import { FilterOptions, PaginationOptions, filterWithPaginate } from '../utils/filterWithPaginate';
import { NewPayment, paymentTable, PaymentMethod } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { stockTable } from "../drizzle/schema/stock";
import { unitTable } from "../drizzle/schema/unit";
import { customerDueTable, NewCustomerDue } from "../drizzle/schema/customerDue";

interface ProductItem {
    productName: string;
    discount: number;
    discountType: "Fixed" | "Percentage";
    price: number;
    quantity: number;
    unit: string;
    stock: number;
    productId: string;
    discountNote: string;
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
                const saleIds: string[] = [];

                // Process each product in the sale
                for (const product of saleData.products) {
                    // Find unit by name
                    const [unit] = await tx
                        .select()
                        .from(unitTable)
                        .where(eq(unitTable.name, product.unit));

                    if (!unit) {
                        throw new Error(`Unit '${product.unit}' not found`);
                    }

                    // Calculate sale amount based on discount type
                    let saleAmount: number;
                    if (product.discountType === "Fixed") {
                        saleAmount = (product.quantity * product.price) - product.discount;
                    } else { // Percentage
                        saleAmount = (product.quantity * product.price) -
                            (product.quantity * product.price * product.discount / 100);
                    }

                    // Create sale record
                    const [sale] = await tx.insert(saleTable).values({
                        createdBy: userId,
                        maintainsId: saleData.maintainsId,
                        customerCategoryId: saleData.customerCategoryId || null,
                        customerId: saleData.customerId || null,
                        productId: product.productId,
                        productName: product.productName,
                        discountType: product.discountType,
                        discountAmount: product.discount,
                        discountNote: product.discountNote,
                        saleQuantity: product.quantity,
                        saleAmount: saleAmount,
                        pricePerUnit: product.price,
                        unit: product.unit
                    }).returning();

                    saleIds.push(sale.id);

                    // Find and update stock
                    const [stockRecord] = await tx
                        .select()
                        .from(stockTable)
                        .where(
                            and(
                                eq(stockTable.maintainsId, saleData.maintainsId),
                                eq(stockTable.unitId, unit.id),
                                eq(stockTable.productId, product.productId),
                                eq(stockTable.pricePerQuantity, product.price)
                            )
                        );

                    if (!stockRecord) {
                        throw new Error(`Stock record not found for product ${product.productName} with unit ${product.unit} and price ${product.price}`);
                    }

                    // Check if stock is sufficient
                    const newQuantity = stockRecord.quantity - product.quantity;
                    if (newQuantity < 0) {
                        throw new Error(`Insufficient stock for product ${product.productName}. Available: ${stockRecord.quantity}, Required: ${product.quantity}`);
                    }

                    // Update stock quantity
                    await tx
                        .update(stockTable)
                        .set({
                            quantity: newQuantity,
                            updatedAt: new Date()
                        })
                        .where(eq(stockTable.id, stockRecord.id));
                }

                // Create payment record
                const paymentMethods: Record<PaymentMethod, number> = {
                    "bkash": 0,
                    "nogod": 0,
                    "cash": 0,
                    "due": 0,
                    "card": 0,
                    'sendForUse': 0
                };
                saleData.paymentInfo.forEach(payment => {
                    paymentMethods[payment.method as keyof PaymentMethod] = payment.amount;
                });

                // Check if due amount is present and validate customer ID
                const dueAmount = paymentMethods.due;
                if (dueAmount > 0 && !saleData.customerId) {
                    // throw new Error("Customer ID is required when due amount is greater than 0");
                    tx.rollback();
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
                    payments: paymentMethods as any,
                    totalAmount: saleData.totalPriceWithDiscount,
                    customerDueId: customerDueId,
                    createdBy: userId
                }).returning();

                // Create junction table entries for payment-sale relationships
                const paymentSaleEntries = saleIds.map(saleId => ({
                    paymentId: payment.id,
                    saleId: saleId
                }));
                await tx.insert(paymentSaleTable).values(paymentSaleEntries);

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