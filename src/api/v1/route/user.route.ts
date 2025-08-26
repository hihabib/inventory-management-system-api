import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { UserController } from '../controller/user.controller';

const router = Router();

// Public routes
router.post('/register', UserController.register);
router.post('/signin', UserController.signIn);

// Protected routes
router.get('/profile', authenticate, UserController.getProfile);

export default router;