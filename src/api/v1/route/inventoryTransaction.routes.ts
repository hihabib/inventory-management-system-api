import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { InventoryTransactionController } from '../controller/inventoryTransaction.controller';
import { isOutlet, isProductionManagerOrOutlet } from '../middleware/role';

const router = Router();

// All inventory transaction routes require authentication
router.use(authenticate);

// Create inventory transaction
router.post('/', isOutlet, InventoryTransactionController.createInventoryTransaction);

// Get all inventory transactions
router.get('/', isProductionManagerOrOutlet, InventoryTransactionController.getAllInventoryTransactions);

// Get inventory transaction by ID
router.get('/:id', isProductionManagerOrOutlet, InventoryTransactionController.getInventoryTransactionById);

// Update inventory transaction
router.put('/:id', isProductionManagerOrOutlet, InventoryTransactionController.updateInventoryTransaction);

// Delete inventory transaction
router.delete('/:id', isProductionManagerOrOutlet, InventoryTransactionController.deleteInventoryTransaction);

// Order specific routes
router.get('/orders/all', isProductionManagerOrOutlet, InventoryTransactionController.getAllOrders);
router.get('/orders/:id', isProductionManagerOrOutlet, InventoryTransactionController.getOrderById);

export default router;