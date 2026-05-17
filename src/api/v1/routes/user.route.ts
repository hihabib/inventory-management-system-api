import { Router } from 'express';
import { UserController } from '../controller/user.controller';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.post('/register', UserController.register);
router.post('/signin', UserController.signIn);
router.post('/', authMiddleware, UserController.register);
router.get('/', authMiddleware, UserController.getUsers);
router.get('/profile', authMiddleware, UserController.getProfile);
// Session management — declared before /:id so the static segments match first.
router.post('/logout', authMiddleware, UserController.logout);
router.get('/:id/sessions', authMiddleware, UserController.getSessionsForUser);
router.delete('/:id/sessions', authMiddleware, UserController.revokeAllSessionsForUser);
router.delete('/:id/sessions/:sessionId', authMiddleware, UserController.revokeSpecificSession);
router.get('/:id', authMiddleware, UserController.getUserById);
router.put('/:id', authMiddleware, UserController.updateUser);
router.delete('/:id', authMiddleware, UserController.deleteUser);

export default router;
