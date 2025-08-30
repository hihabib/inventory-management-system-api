import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ProductCategoryController } from '../controller/productCategory.controller';

const router = Router();


// Create product category
router.post('/', ProductCategoryController.createProductCategory);

// Get all product categories
router.get('/', ProductCategoryController.getAllProductCategories);

// Get product category by ID
router.get('/:id', ProductCategoryController.getProductCategoryById);

// Update product category
router.put('/:id', ProductCategoryController.updateProductCategory);

// Delete product category
router.delete('/:id', ProductCategoryController.deleteProductCategory);

export default router;