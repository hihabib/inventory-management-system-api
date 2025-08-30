import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { InventoryStockController } from '../controller/inventoryStock.controller';
import { isProductionManager, isProductionManagerOrOutlet } from '../middleware/role';

const router = Router();

// All inventory stock routes require authentication
router.use(authenticate);

// Create inventory stock
router.post('/', isProductionManager,InventoryStockController.createInventoryStock);

// Get all inventory stocks
router.get('/', isProductionManager, InventoryStockController.getAllInventoryStocks);

// Get inventory stock by ID
router.get('/:id', isProductionManager, InventoryStockController.getInventoryStockById);

// Update inventory stock
router.put('/:id', isProductionManagerOrOutlet, InventoryStockController.updateInventoryStock);

// Delete inventory stock
router.delete('/:id', isProductionManager, InventoryStockController.deleteInventoryStock);

export default router;