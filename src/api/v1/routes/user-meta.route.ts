import { Router } from 'express';
import { UserMetaController } from '../controller/user-meta.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// All user-meta routes require authentication
router.use(authMiddleware);

router.get('/', UserMetaController.getUserMeta);
router.put('/', UserMetaController.setUserMeta);
router.delete('/:key', UserMetaController.deleteUserMeta);

export default router;
