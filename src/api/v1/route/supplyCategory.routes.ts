import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { SupplyCategoryController } from '../controller/supplyCategory.controller';

const router = Router();

// All supply category routes require authentication
router.use(authenticate);

// Create supply category
router.post('/', SupplyCategoryController.createSupplyCategory);

// Get all supply categories
router.get('/', SupplyCategoryController.getAllSupplyCategories);

// Get supply category by ID
router.get('/:id', SupplyCategoryController.getSupplyCategoryById);

// Update supply category
router.put('/:id', SupplyCategoryController.updateSupplyCategory);

// Delete supply category
router.delete('/:id', SupplyCategoryController.deleteSupplyCategory);

export default router;