import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { ProductCategoryService } from '../service/productCategory.service';
import { UpdateCategoryData } from '../types';

export class ProductCategoryController {
  // Create a new product category
  static createProductCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { categoryName, categorySlug } = req.body;
    
    if (!categoryName || !categorySlug) {
      return sendResponse(res, 400, 'Category name and slug are required');
    }
    
    const categoryData = {
      categoryName,
      categorySlug,
      createdBy: req.user?.id // If user is authenticated, use their ID
    };
    
    const newCategory = await ProductCategoryService.createProductCategory(categoryData);
    
    sendResponse(res, 201, 'Product category created successfully', newCategory);
  });
  
  // Get all product categories
  static getAllProductCategories = requestHandler(async (req: AuthRequest, res: Response) => {
    const allCategories = await ProductCategoryService.getAllProductCategories();
    
    sendResponse(res, 200, 'Product categories retrieved successfully', allCategories);
  });
  
  // Get product category by ID
  static getProductCategoryById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const category = await ProductCategoryService.getProductCategoryById(id);
    
    sendResponse(res, 200, 'Product category retrieved successfully', category);
  });
  
  // Update product category
  static updateProductCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { categoryName, categorySlug } = req.body;
    
    // In the updateProductCategory method:
    const categoryData: UpdateCategoryData = {};
    
    if (categoryName !== undefined) categoryData.categoryName = categoryName;
    if (categorySlug !== undefined) categoryData.categorySlug = categorySlug;
    
    const updatedCategory = await ProductCategoryService.updateProductCategory(id, categoryData);
    
    sendResponse(res, 200, 'Product category updated successfully', updatedCategory);
  });
  
  // Delete product category
  static deleteProductCategory = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    
    const result = await ProductCategoryService.deleteProductCategory(id);
    
    sendResponse(res, 200, result.message);
  });
}