import { Request } from 'express';
import { UserRole } from '../middleware/role';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        role: UserRole;
      };
    }
  }
}