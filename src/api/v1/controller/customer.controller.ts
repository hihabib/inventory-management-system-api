import { Request, Response } from "express";
import { NewCustomer } from "../drizzle/schema/customer";
import { CustomerService } from "../service/customer.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { AuthRequest } from "../middleware/auth";

export class CustomerController {
    static createCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id: createdBy } = req.user;
        const { name, email, phone, about, categoryId, } = req.body as NewCustomer;
        const createdCustomer = await CustomerService.createCustomer({
            name,
            email,
            createdBy,
            phone,
            categoryId,
            about,
        });
        sendResponse(res, 201, 'Customer created successfully', createdCustomer);
    })

    static updateCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const customerData = req.body as Partial<NewCustomer>;
        const updatedCustomer = await CustomerService.updateCustomer(id, customerData);
        sendResponse(res, 200, 'Customer updated successfully', updatedCustomer);
    })

    static deleteCustomer = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedCustomer = await CustomerService.deleteCustomer(id);
        sendResponse(res, 200, 'Customer deleted successfully', deletedCustomer);
    })

    static getCustomers = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const customers = await CustomerService.getCustomers(pagination, filter);
        sendResponse(res, 200, 'Customers fetched successfully', customers);
    })

    static getCustomerById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const customer = await CustomerService.getCustomerById(id);
        sendResponse(res, 200, 'Customer fetched successfully', customer);
    })
}