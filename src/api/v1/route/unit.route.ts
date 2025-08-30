import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { UnitController } from '../controller/unit.controller';

const router = Router();

// Create unit
router.post('/', UnitController.createUnit);

// Get all units
router.get('/', UnitController.getAllUnits);

// Get unit by ID
router.get('/:id', UnitController.getUnitById);

// Update unit
router.put('/:id', UnitController.updateUnit);

// Delete unit
router.delete('/:id', UnitController.deleteUnit);

export default router;