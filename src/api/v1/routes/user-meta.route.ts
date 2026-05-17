import { Router } from 'express';
import { UserMetaController } from '../controller/user-meta.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All user-meta routes require authentication
router.use(authMiddleware);

// Admin/manager-only routes for managing another user's navigation permissions.
// Placed before the generic routes so the static "admin" segment is matched first.
router.get('/admin/:userId/nav-permissions', UserMetaController.getNavPermissionsForUser);
router.put('/admin/:userId/nav-permissions', UserMetaController.setNavPermissionsForUser);

router.get('/', UserMetaController.getUserMeta);
router.put('/', UserMetaController.setUserMeta);
router.delete('/:key', UserMetaController.deleteUserMeta);

export default router;
