import jwt from 'jsonwebtoken';
import { JWT_EXPIRES_IN, JWT_SECRET } from '../config/env';


export interface JWTPayload {
  id: string;
  username: string;
  email: string;
  roleId: string;
  // Identifier of the server-side session row. The auth middleware uses this
  // to verify that the session hasn't been revoked (logout, force-logout,
  // user-deleted).
  sessionId?: string;
}

export const generateToken = (payload: JWTPayload): string => {
  // return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
  return jwt.sign(payload, JWT_SECRET);
};

export const verifyToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET) as JWTPayload;
};