import { Router } from 'express';
import { UnitController } from '../controller/unit.controller';

const router = Router();

router
    .post('/', UnitController.createUnit)
    .get('/', UnitController.getUnits)
    .get('/:id', UnitController.getUnitById)
    .put('/:id', UnitController.updateUnit)
    .delete('/:id', UnitController.deleteUnit);

export default router;