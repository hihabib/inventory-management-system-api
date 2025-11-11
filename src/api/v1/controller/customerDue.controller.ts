import { Request, Response } from "express";
import { NewCustomerDue } from "../drizzle/schema/customerDue";
import { AuthRequest } from "../middleware/auth";
import { CustomerDueService } from "../service/customerDue.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class CustomerDueController {
    // GET /customer-due - Fetch Customer Due List with pagination and filtering
    static getCustomerDues = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const result = await CustomerDueService.getCustomerDues(pagination, filter);
        
        sendResponse(res, 200, "Customer due records retrieved successfully", result);
    });

    // GET /customer-due/:id - Get a specific customer due record by ID
    static getCustomerDueById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const customerDue = await CustomerDueService.getCustomerDueById(id);
        
        sendResponse(res, 200, "Customer due record retrieved successfully", customerDue);
    });

    // POST /customer-due - Create a new customer due record
    static createCustomerDue = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id: createdBy } = req.user;
        const customerDueData: NewCustomerDue = { ...req.body, createdBy };
        const createdCustomerDue = await CustomerDueService.createCustomerDue(customerDueData);
        
        sendResponse(res, 201, "Customer due record created successfully", createdCustomerDue);
    });

    // PUT /customer-due/:id - Update an existing customer due record
    static updateCustomerDue = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { id: updatedBy } = req.user;
        const customerDueData: Partial<NewCustomerDue> = req.body;
        const updatedCustomerDue = await CustomerDueService.updateCustomerDue(id, customerDueData, updatedBy);
        
        sendResponse(res, 200, "Customer due record updated successfully", updatedCustomerDue);
    });

    // DELETE /customer-due/:id - Delete a customer due record
    static deleteCustomerDue = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedCustomerDue = await CustomerDueService.deleteCustomerDue(id);
        
        sendResponse(res, 200, "Customer due record deleted successfully", deletedCustomerDue);
    });
}