import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OutletController } from '../controller/outlet.controller';
import { isManager, isOutlet } from '../middleware/role';

const router = Router();


// Create outlet
router.post('/', [authenticate, isManager],OutletController.createOutlet);

// Get all outlets
router.get('/',[authenticate, isManager], OutletController.getAllOutlets);

// Get outlet by ID
router.get('/:id', [authenticate, isManager],OutletController.getOutletById);

// Update outlet
router.put('/:id', [authenticate, isManager],OutletController.updateOutlet);

// Delete outlet
router.delete('/:id',[authenticate, isManager], OutletController.deleteOutlet);

router.get('/by-user/:userId', [authenticate, isOutlet], OutletController.getOutletByAssignedUserId);

export default router;