import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { InventoryItemController } from '../controller/inventoryItem.controller';
import { isOutlet, isProductionManager, isProductionManagerOrOutlet } from '../middleware/role';

const router = Router();

// All inventory item routes require authentication
router.use(authenticate);

// Create inventory item
router.post('/', isProductionManager, InventoryItemController.createInventoryItem);

// Get all inventory items
router.get('/', isOutlet, InventoryItemController.getAllInventoryItems);

// Get inventory item by ID
router.get('/:id',isProductionManagerOrOutlet, InventoryItemController.getInventoryItemById);

// Update inventory item
router.put('/:id', isProductionManager, InventoryItemController.updateInventoryItem);

// Delete inventory item
router.delete('/:id', isProductionManager, InventoryItemController.deleteInventoryItem);

export default router;