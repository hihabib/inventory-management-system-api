import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { SupplyItemController } from '../controller/supplyItem.controller';

const router = Router();


// Create supply item
router.post('/', SupplyItemController.createSupplyItem);

// Get all supply items
router.get('/', SupplyItemController.getAllSupplyItems);

// Get supply item by ID
router.get('/:id', SupplyItemController.getSupplyItemById);

// Update supply item
router.put('/:id', SupplyItemController.updateSupplyItem);

// Delete supply item
router.delete('/:id', SupplyItemController.deleteSupplyItem);

export default router;