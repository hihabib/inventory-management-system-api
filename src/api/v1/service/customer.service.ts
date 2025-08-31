import { Customer, customers, NewCustomer } from '../drizzle/schema/customer';
import { eq } from 'drizzle-orm';
import { AppError } from '../utils/AppError';
import { db } from '../drizzle/db';
import { customerCategories } from '../drizzle/schema/customerCategory';

export class CustomerService {
  // Create a new customer
  static async createCustomer(customerData: Partial<Customer>) {

    const { name, email, phone, categoryId } = customerData;

    if (!name || !phone || !categoryId) {
      throw new AppError('Customer name, phone, and category ID are required', 400);
    }
    // Check if customer with same email already exists
    const existingCustomer = await db
      .select()
      .from(customers)
      .where(eq(customers.phone, phone))
      .limit(1);

    if (existingCustomer.length > 0) {
      throw new AppError('Customer with this phone number already exists', 409);
    }

    if(email){
      const existingCustomer = await db
        .select()
        .from(customers)
        .where(eq(customers.email, email))
        .limit(1);

      if (existingCustomer.length > 0) {
        throw new AppError('Customer with this email already exists', 409);
      }
    }

    // If categoryId is provided, check if it exists
    if (customerData.categoryId) {
      const categoryExists = await db
        .select({ id: customerCategories.id })
        .from(customerCategories)
        .where(eq(customerCategories.id, customerData.categoryId))
        .limit(1);

      if (categoryExists.length === 0) {
        throw new AppError('Customer category not found', 404);
      }
    }

    // Insert the customer into the database
    const [createdCustomer] = await db.insert(customers).values({
      name: name,
      phone: phone,
      categoryId: categoryId,
      email: email ?? null
    }).returning();

    if (!createdCustomer) {
      throw new AppError('Failed to create customer', 500);
    }

    return createdCustomer;
  }

  // Get all customers
  static async getAllCustomers() {
    const allCustomers = await db
      .select({
        id: customers.id,
        name: customers.name,
        email: customers.email,
        phone: customers.phone,
        categoryId: customers.categoryId,
        createdAt: customers.createdAt,
        updatedAt: customers.updatedAt
      })
      .from(customers);

    return allCustomers;
  }

  // Get customer by ID
  static async getCustomerById(id: string) {
    const customer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);

    if (customer.length === 0) {
      throw new AppError('Customer not found', 404);
    }

    return customer[0];
  }

  // Update customer
  static async updateCustomer(id: string, customerData: Partial<Omit<NewCustomer, 'id'>>) {
    // Check if customer exists
    const existingCustomer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);

    if (existingCustomer.length === 0) {
      throw new AppError('Customer not found', 404);
    }

    // If updating email, check for uniqueness
    if (customerData.email) {
      const duplicateCustomer = await db
        .select()
        .from(customers)
        .where(eq(customers.email, customerData.email))
        .limit(1);

      if (duplicateCustomer.length > 0 && duplicateCustomer[0].id !== id) {
        throw new AppError('Customer with this email already exists', 409);
      }
    }

    // If updating categoryId, check if it exists
    if (customerData.categoryId) {
      const categoryExists = await db
        .select({ id: customerCategories.id })
        .from(customerCategories)
        .where(eq(customerCategories.id, customerData.categoryId))
        .limit(1);

      if (categoryExists.length === 0) {
        throw new AppError('Customer category not found', 404);
      }
    }

    // Update the customer
    const [updatedCustomer] = await db
      .update(customers)
      .set({ ...customerData, updatedAt: new Date() })
      .where(eq(customers.id, id))
      .returning();

    return updatedCustomer;
  }

  // Delete customer
  static async deleteCustomer(id: string) {
    // Check if customer exists
    const existingCustomer = await db
      .select()
      .from(customers)
      .where(eq(customers.id, id))
      .limit(1);

    if (existingCustomer.length === 0) {
      throw new AppError('Customer not found', 404);
    }

    // Delete the customer
    await db.delete(customers).where(eq(customers.id, id));

    return { success: true, message: 'Customer deleted successfully' };
  }
}