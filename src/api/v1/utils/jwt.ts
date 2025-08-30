import jwt from 'jsonwebtoken';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config/env';
import { UserRole } from '../middleware/role';


export interface JWTPayload {
  id: string;
  username: string;
  email: string;
  role: UserRole
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};