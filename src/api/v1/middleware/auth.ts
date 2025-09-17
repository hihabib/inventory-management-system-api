import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';
import { sendResponse } from '../utils/response';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    roleId: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // return res.status(401).json({ message: "No token provided" });
    return sendResponse(res, 401, "No token provided");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
      id: string;
      username: string;
      email: string;
      roleId: string;
    };

    req.user = decoded;
    next();
  } catch (err) {
    // return res.status(401).json({ message: "Invalid or expired token" });
    return sendResponse(res, 401, "Invalid or expired token");
  }
}