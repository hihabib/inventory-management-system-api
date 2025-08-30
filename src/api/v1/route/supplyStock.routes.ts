import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { SupplyStockController } from '../controller/supplyStock.controller';

const router = Router();


// Create supply stock
router.post('/', SupplyStockController.createSupplyStock);

// Get all supply stocks
router.get('/', SupplyStockController.getAllSupplyStocks);

// Get supply stock by ID
router.get('/:id', SupplyStockController.getSupplyStockById);

// Update supply stock
router.put('/:id', SupplyStockController.updateSupplyStock);

// Delete supply stock
router.delete('/:id', SupplyStockController.deleteSupplyStock);

export default router;