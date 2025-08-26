import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OutletController } from '../controller/outlet.controller';

const router = Router();

// All outlet routes require authentication
router.use(authenticate);

// Create outlet
router.post('/', OutletController.createOutlet);

// Get all outlets
router.get('/', OutletController.getAllOutlets);

// Get outlet by ID
router.get('/:id', OutletController.getOutletById);

// Update outlet
router.put('/:id', OutletController.updateOutlet);

// Delete outlet
router.delete('/:id', OutletController.deleteOutlet);

export default router;