import { Router } from 'express';
import { UserController } from '../controller/user.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', UserController.register);
router.post('/signin', UserController.signIn);
router.get('/', authMiddleware, UserController.getUsers);
router.get('/profile', authMiddleware, UserController.getProfile);

export default router;