import { Router } from 'express';
import { RoleController } from '../controller/role.controller';

const router = Router();

router
    .delete('/:id', RoleController.deleteRole)
    .put('/:id', RoleController.updateRole)
    .get('/:id', RoleController.getRole)
    .post('/', RoleController.createRole)
    .get('/', RoleController.getRoles)



export default router;