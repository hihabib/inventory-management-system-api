import { Response } from 'express';

export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T;
}

export const sendResponse = <T = any>(
  res: Response,
  statusCode: number,
  message: string,
  data?: T
): void => {
  const success = statusCode >= 200 && statusCode < 300;
  
  res.status(statusCode).json({
    success,
    message,
    statusCode,
    data: data ?? {}
  });
};