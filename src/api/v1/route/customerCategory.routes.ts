import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { CustomerCategoryController } from '../controller/customerCategory.controller';

const router = Router();


// Create customer category
router.post('/', CustomerCategoryController.createCustomerCategory);

// Get all customer categories
router.get('/', CustomerCategoryController.getAllCustomerCategories);

// Get default customer category
router.get('/default', CustomerCategoryController.getDefaultCustomerCategory);

// Get customer category by ID
router.get('/:id', CustomerCategoryController.getCustomerCategoryById);

// Update customer category
router.put('/:id', CustomerCategoryController.updateCustomerCategory);



// Delete customer category
router.delete('/:id', CustomerCategoryController.deleteCustomerCategory);


export default router;