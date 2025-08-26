import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { sendResponse } from '../utils/response';

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  
  // Log error for debugging
  console.error(`Error: ${err.message}`);
  console.error(err.stack);
  
  // Send error response in the standardized format
  sendResponse(res, statusCode, message);
};