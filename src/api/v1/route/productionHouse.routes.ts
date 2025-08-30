import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ProductionHouseController } from '../controller/productionHouse.controller';
import { isManager, isProductionManager } from '../middleware/role';

const router = Router();
// Create production house
router.post('/', [authenticate, isManager], ProductionHouseController.createProductionHouse);

// Get all production houses
router.get('/', [authenticate, isManager], ProductionHouseController.getAllProductionHouses);

// Get production house by ID
router.get('/:id', [authenticate, isManager], ProductionHouseController.getProductionHouseById);

// Update production house
router.put('/:id', [authenticate, isManager], ProductionHouseController.updateProductionHouse);

// Delete production house
router.delete('/:id', [authenticate, isManager], ProductionHouseController.deleteProductionHouse);

router.get('/by-user/:userId', [ authenticate, isProductionManager], ProductionHouseController.getProductionHouseByAssignedUserId);

export default router;