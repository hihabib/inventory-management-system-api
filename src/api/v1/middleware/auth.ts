import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { sendResponse } from '../utils/response';
import { UserRole } from './role';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: UserRole;
  };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return sendResponse(res, 401, 'Access denied. No token provided.');
    }
    
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return sendResponse(res, error.statusCode || 401, error.message);
    }
    
    return sendResponse(res, 401, 'Invalid token');
  }
};

export const authorize = (roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendResponse(res, 401, 'Access denied. Not authenticated.');
    }
    
    if (!roles.includes(req.user.role)) {
      return sendResponse(res, 403, 'Access denied. Not authorized.');
    }
    
    next();
  };
};