import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { CustomerCategoryService } from '../service/customerCategory.service';
import { NewCustomerCategory } from '../drizzle/schema/customerCategory';

export class CustomerCategoryController {
  // Create a new customer category
  static createCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { categoryName, categorySlug, discount, discountType, isDefault } = req.body;
    
    if (!categoryName || !categorySlug) {
      return sendResponse(res, 400, 'Category name and slug are required');
    }
    
    const categoryData = {
      categoryName,
      categorySlug,
      discount: discount || 0,
      discountType: discountType || 'fixed',
      isDefault: isDefault || false
    };
    
    const newCategory = await CustomerCategoryService.createCustomerCategory(categoryData);
    
    sendResponse(res, 201, 'Customer category created successfully', newCategory);
  });
  
  // Get all customer categories
  static getAllCustomerCategories = requestHandler(async (req: AuthRequest, res: Response) => {
    const allCategories = await CustomerCategoryService.getAllCustomerCategories();
    
    sendResponse(res, 200, 'Customer categories retrieved successfully', allCategories);
  });
  
  // Get customer category by ID
  static getCustomerCategoryById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const category = await CustomerCategoryService.getCustomerCategoryById(id);
    
    sendResponse(res, 200, 'Customer category retrieved successfully', category);
  });
  
  // Update customer category
  static updateCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { categoryName, categorySlug, discount, discountType, isDefault } = req.body;
    
    const categoryData: Partial<Omit<NewCustomerCategory, "id">> = {};
    
    if (categoryName !== undefined) categoryData.categoryName = categoryName;
    if (categorySlug !== undefined) categoryData.categorySlug = categorySlug;
    if (discount !== undefined) categoryData.discount = discount;
    if (discountType !== undefined) categoryData.discountType = discountType;
    if (isDefault !== undefined) categoryData.isDefault = isDefault;
    
    const updatedCategory = await CustomerCategoryService.updateCustomerCategory(id, categoryData);
    
    sendResponse(res, 200, 'Customer category updated successfully', updatedCategory);
  });
  
  // Delete customer category
  static deleteCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await CustomerCategoryService.deleteCustomerCategory(id);
    
    sendResponse(res, 200, result.message);
  });
  
  // Get default customer category
  static getDefaultCustomerCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const defaultCategory = await CustomerCategoryService.getDefaultCustomerCategory();
    
    sendResponse(res, 200, 'Default customer category retrieved successfully', defaultCategory);
  });
}