import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { SupplyCategoryService } from '../service/supplyCategory.service';
// import  } fro as anym '../types';

export class SupplyCategoryController {
  // Create a new supply category
  static createSupplyCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { categoryName, categorySlug } = req.body;
    
    if (!categoryName || !categorySlug) {
      return sendResponse(res, 400, 'Category name and slug are required');
    }
    
    const categoryData = {
      categoryName,
      categorySlug,
      createdBy: req.user?.id // If user is authenticated, use their ID
    };
    
    const newCategory = await SupplyCategoryService.createSupplyCategory(categoryData);
    
    sendResponse(res, 201, 'Supply category created successfully', newCategory);
  });
  
  // Get all supply categories
  static getAllSupplyCategories = requestHandler(async (req: AuthRequest, res: Response) => {
    const allCategories = await SupplyCategoryService.getAllSupplyCategories();
    
    sendResponse(res, 200, 'Supply categories retrieved successfully', allCategories);
  });
  
  // Get supply category by ID
  static getSupplyCategoryById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const category = await SupplyCategoryService.getSupplyCategoryById(id);
    
    sendResponse(res, 200, 'Supply category retrieved successfully', category);
  });
  
  // Update supply category
  static updateSupplyCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { categoryName, categorySlug } = req.body;
    
    const categoryData = {} as any; // UpdateSupplyCategoryData;
    
    if (categoryName !== undefined) categoryData.categoryName = categoryName;
    if (categorySlug !== undefined) categoryData.categorySlug = categorySlug;
    
    const updatedCategory = await SupplyCategoryService.updateSupplyCategory(id, categoryData);
    
    sendResponse(res, 200, 'Supply category updated successfully', updatedCategory);
  });
  
  // Delete supply category
  static deleteSupplyCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await SupplyCategoryService.deleteSupplyCategory(id);
    
    sendResponse(res, 200, result.message);
  });
}