import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { AppError } from '../utils/AppError';
import { sendResponse } from '../utils/response';

// Extend Express Request type to include user property
export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
  };
}

// Create proper middleware function with correct types
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    
    if (!token) {
      return sendResponse(res, 401, 'Access denied. No token provided.');
    }
    
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return sendResponse(res, error.statusCode, error.message);
    }
    
    return sendResponse(res, 401, 'Invalid token');
  }
};

// Authorization middleware
export const authorize = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return sendResponse(res, 401, 'Access denied. Not authenticated.');
    }
    
    if (!roles.includes(req.user.role)) {
      return sendResponse(res, 403, 'Access denied. Not authorized.');
    }
    
    next();
  };
};