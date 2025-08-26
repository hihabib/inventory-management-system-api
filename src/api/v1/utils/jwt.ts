import jwt from 'jsonwebtoken';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config/env';


export interface JWTPayload {
  id: string;
  username: string;
  email: string;
  role: string;
}

export const generateToken = (payload: JWTPayload): string => {
  // Using type assertion to resolve the TypeScript issue
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};