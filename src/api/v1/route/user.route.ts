import { Router } from 'express';
import { UserController } from '../controller/user.controller';
import { authenticate } from '../middleware/auth';
import { isManager } from '../middleware/role';

const router = Router();

// Public routes
// router.post('/register', [authenticate, isManager], UserController.register);
router.post('/register',  UserController.register);
router.post('/signin', UserController.signIn);

// Protected routes
router.get('/profile', authenticate, UserController.getProfile);

export default router;