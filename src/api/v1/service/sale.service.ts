import { eq, and } from "drizzle-orm";
import { db } from "../drizzle/db";
import { NewSale, saleTable } from "../drizzle/schema/sale";
import { NewPayment, paymentTable, PaymentMethod } from "../drizzle/schema/payment";
import { paymentSaleTable } from "../drizzle/schema/paymentSale";
import { stockTable } from "../drizzle/schema/stock";
import { unitTable } from "../drizzle/schema/unit";

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
                        saleAmount: saleAmount
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
                const paymentMethods: Record< PaymentMethod, number> = {
                    "Bkash": 0,
                    "Nogod": 0,
                    "Cash": 0,
                    "Due": 0,
                    "Card": 0
                };
                saleData.paymentInfo.forEach(payment => {
                    paymentMethods[payment.method as keyof PaymentMethod] = payment.amount;
                });

                const [payment] = await tx.insert(paymentTable).values({
                    maintainsId: saleData.maintainsId,
                    payments: paymentMethods as any,
                    totalAmount: saleData.totalPriceWithDiscount,
                    customerDueId: null,
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
        pagination: { page?: number; limit?: number } = {},
        filter: { maintainsId?: string; customerId?: string; customerCategoryId?: string } = {}
    ) {
        const query = db.select().from(saleTable);
        
        // Apply filters
        const conditions = [];
        if (filter.maintainsId) {
            conditions.push(eq(saleTable.maintainsId, filter.maintainsId));
        }
        if (filter.customerId) {
            conditions.push(eq(saleTable.customerId, filter.customerId));
        }
        if (filter.customerCategoryId) {
            conditions.push(eq(saleTable.customerCategoryId, filter.customerCategoryId));
        }

        if (conditions.length > 0) {
            query.where(and(...conditions));
        }

        // Apply pagination
        const page = pagination.page || 1;
        const limit = pagination.limit || 10;
        const offset = (page - 1) * limit;

        const sales = await query.limit(limit).offset(offset);
        return sales;
    }

    static async getSaleById(id: string) {
        const [sale] = await db.select().from(saleTable).where(eq(saleTable.id, id));
        return sale;
    }
}