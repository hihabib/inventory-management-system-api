import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { CustomerService } from '../service/customer.service';

export class CustomerController {
  // Create a new customer
  static createCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
    const { name, email, phone, categoryId } = req.body;
    
    if (!name || !email) {
      return sendResponse(res, 400, 'Customer name and email are required');
    }
    
    const customerData = {
      name,
      email,
      phone,
      categoryId
    };
    
    const newCustomer = await CustomerService.createCustomer(customerData);
    
    sendResponse(res, 201, 'Customer created successfully', newCustomer);
  });
  
  // Get all customers
  static getAllCustomers = requestHandler(async (req: AuthRequest, res: Response) => {
    const allCustomers = await CustomerService.getAllCustomers();
    
    sendResponse(res, 200, 'Customers retrieved successfully', allCustomers);
  });
  
  // Get customer by ID
  static getCustomerById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const customer = await CustomerService.getCustomerById(id);
    
    sendResponse(res, 200, 'Customer retrieved successfully', customer);
  });
  
  // Update customer
  static updateCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, email, phone, categoryId } = req.body;
    
    const customerData: any = {};
    
    if (name !== undefined) customerData.name = name;
    if (email !== undefined) customerData.email = email;
    if (phone !== undefined) customerData.phone = phone;
    if (categoryId !== undefined) customerData.categoryId = categoryId;
    
    const updatedCustomer = await CustomerService.updateCustomer(id, customerData);
    
    sendResponse(res, 200, 'Customer updated successfully', updatedCustomer);
  });
  
  // Delete customer
  static deleteCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await CustomerService.deleteCustomer(id);
    
    sendResponse(res, 200, result.message);
  });
}