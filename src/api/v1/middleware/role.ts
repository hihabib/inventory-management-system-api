import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { sendResponse } from '../utils/response';

// Define role types
export type UserRole = 'admin' | 'outlet' | 'production-manager' | 'manager';

// Middleware to check if user has required role
export const checkRole = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    // if (!req.user) {
    //   return sendResponse(res, 401, 'Authentication required');
    // }

    // if (!roles.includes(req.user.role as UserRole)) {
    //   return sendResponse(res, 403, 'Access denied. Insufficient permissions');
    // }

    next();
  };
};

// Specific role middlewares for convenience
export const isAdmin = checkRole(['admin', 'manager']);
export const isOutlet = checkRole(['outlet', 'admin', 'manager']);
export const isProductionManager = checkRole(['production-manager', 'admin', 'manager']);
export const isManager = checkRole(['manager', 'admin']);
export const isProductionManagerOrOutlet = checkRole(['production-manager', 'outlet', 'admin', 'manager']);