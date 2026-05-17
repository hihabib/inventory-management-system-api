import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { and, eq, isNull } from 'drizzle-orm';
import { JWT_SECRET } from '../config/env';
import { sendResponse } from '../utils/response';
import { db } from '../drizzle/db';
import { userSessionTable } from '../drizzle/schema/userSession';
import { userTable } from '../drizzle/schema/user';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    roleId: string;
    sessionId?: string;
  };
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return sendResponse(res, 401, "No token provided");
  }

  const token = authHeader.split(" ")[1];

  let decoded: {
    id: string;
    username: string;
    email: string;
    roleId: string;
    sessionId?: string;
  };
  try {
    decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
  } catch {
    return sendResponse(res, 401, "Invalid or expired token");
  }

  // Server-side checks: the JWT signature is valid but the session might
  // have been revoked (logout, admin force-logout) or the user soft-deleted
  // since the token was issued.
  try {
    // 1) The user must still exist and not be soft-deleted.
    const userRows = await db.select({ id: userTable.id, deletedAt: userTable.deletedAt })
      .from(userTable)
      .where(eq(userTable.id, decoded.id))
      .limit(1);
    const user = userRows[0];
    if (!user || user.deletedAt) {
      return sendResponse(res, 401, "Account is no longer active");
    }

    // 2) If the token carries a sessionId, the session must be active.
    //    Tokens issued before the sessions feature shipped don't carry one;
    //    we still accept those so existing logged-in users aren't booted
    //    until their next login (back-compat).
    if (decoded.sessionId) {
      const sessionRows = await db.select({
        id: userSessionTable.id,
        revokedAt: userSessionTable.revokedAt,
        userId: userSessionTable.userId,
      })
        .from(userSessionTable)
        .where(and(eq(userSessionTable.id, decoded.sessionId), eq(userSessionTable.userId, decoded.id)))
        .limit(1);
      const session = sessionRows[0];
      if (!session || session.revokedAt) {
        return sendResponse(res, 401, "Session has been revoked");
      }

      // 3) Bump lastActiveAt. Fire-and-forget — failure here shouldn't break
      //    the request.
      db.update(userSessionTable)
        .set({ lastActiveAt: new Date() })
        .where(eq(userSessionTable.id, decoded.sessionId))
        .catch((err) => console.warn('[auth] failed to bump lastActiveAt:', err));
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('[auth] middleware error:', err);
    return sendResponse(res, 500, "Failed to validate session");
  }
}
