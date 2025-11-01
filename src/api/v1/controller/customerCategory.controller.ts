import { Request, Response } from "express";
import { NewCustomerCategory } from "../drizzle/schema/customerCategory";
import { CustomerCategoryService } from "../service/customerCategory.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { AuthRequest } from "../middleware/auth";

export class CustomerCategoryController {
    static createCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.user;
        const { categoryName, discountAmount, discountType, type } = req.body as NewCustomerCategory;
        
        // Validate type field if provided
        if (type && !['Outlet', 'Production'].includes(type)) {
            return sendResponse(res, 400, 'Invalid type. Must be either "Outlet" or "Production"', null);
        }
        
        const createdCustomerCategory = await CustomerCategoryService.createCustomerCategory({
            categoryName,
            createdBy: id,
            discountAmount,
            discountType,
            ...(type && { type }), // Include type only if provided
        });
        sendResponse(res, 201, 'Customer category created successfully', createdCustomerCategory);
    })

    static updateCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const customerCategoryData = req.body as Partial<NewCustomerCategory>;
        
        // Validate type field if provided
        if (customerCategoryData.type && !['Outlet', 'Production'].includes(customerCategoryData.type)) {
            return sendResponse(res, 400, 'Invalid type. Must be either "Outlet" or "Production"', null);
        }
        
        const updatedCustomerCategory = await CustomerCategoryService.updateCustomerCategory(id, customerCategoryData);
        sendResponse(res, 200, 'Customer category updated successfully', updatedCustomerCategory);
    })

    static deleteCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedCustomerCategory = await CustomerCategoryService.deleteCustomerCategory(id);
        sendResponse(res, 200, 'Customer category deleted successfully', deletedCustomerCategory);
    })

    static getCustomerCategories = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const customerCategories = await CustomerCategoryService.getCustomerCategories(pagination, filter);
        sendResponse(res, 200, 'Customer categories fetched successfully', customerCategories);
    })

    static getCustomerCategoryById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const customerCategory = await CustomerCategoryService.getCustomerCategoryById(id);
        sendResponse(res, 200, 'Customer category fetched successfully', customerCategory);
    })
}