import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';

// Define a type for async request handlers
type AsyncRequestHandler = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => Promise<any>;

// Wrapper function to handle async errors automatically
export const requestHandler = (fn: AsyncRequestHandler) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};