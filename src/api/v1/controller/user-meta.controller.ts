import { Response } from 'express';
import { eq } from 'drizzle-orm';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UserMetaService } from '../service/user-meta.service';
import { db } from '../drizzle/db';
import { userTable } from '../drizzle/schema/user';
import { roleTable } from '../drizzle/schema/role';

interface PutUserMetaBody {
  key: string;
  value: any;
  merge?: boolean;
}

// Verify the calling user has the 'admin' or 'manager' role. The auth
// middleware only attaches role id, so we resolve the role name here.
async function assertAdminOrManager(req: AuthRequest, res: Response): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId) {
    sendResponse(res, 401, 'User not authenticated');
    return false;
  }
  const rows = await db.select({ roleName: roleTable.name })
    .from(userTable)
    .leftJoin(roleTable, eq(userTable.roleId, roleTable.id))
    .where(eq(userTable.id, userId))
    .limit(1);
  const roleName = rows[0]?.roleName;
  if (roleName !== 'admin' && roleName !== 'manager') {
    sendResponse(res, 403, 'Only admin or manager can perform this action');
    return false;
  }
  return true;
}

export class UserMetaController {
  // GET /api/v1/user-meta - Get user metadata
  static getUserMeta = requestHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, 'User not authenticated');
    }

    // Parse keys from query parameter
    // Supports both ?keys=hold_items and ?keys=hold_items,user_preferences
    const keysQuery = req.query.keys as string | string[] | undefined;
    let keys: string[] | undefined;

    if (keysQuery) {
      if (Array.isArray(keysQuery)) {
        keys = keysQuery;
      } else {
        keys = keysQuery.split(',').map(k => k.trim());
      }
    }

    // Check if this is a search request for hold items
    const searchQuery = req.query.search as string | undefined;
    if (searchQuery !== undefined) {
      const holdItems = await UserMetaService.searchHoldItems(userId, searchQuery);
      return sendResponse(res, 200, 'Hold items search results', { hold_items: holdItems });
    }

    const metadata = await UserMetaService.getUserMeta(userId, keys);
    sendResponse(res, 200, 'User metadata retrieved successfully', metadata);
  });

  // PUT /api/v1/user-meta - Create or update user metadata
  static setUserMeta = requestHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, 'User not authenticated');
    }

    const { key, value, merge = false } = req.body as PutUserMetaBody;

    // Validate required fields
    if (!key || typeof key !== 'string') {
      return sendResponse(res, 400, 'Key is required and must be a string');
    }

    if (value === undefined) {
      return sendResponse(res, 400, 'Value is required');
    }

    const result = await UserMetaService.setUserMeta(userId, key, value, merge);
    sendResponse(res, 200, 'User metadata updated successfully', result);
  });

  // GET /api/v1/user-meta/admin/:userId/nav-permissions
  // Admin/manager-only: read another user's navigation permissions.
  static getNavPermissionsForUser = requestHandler(async (req: AuthRequest, res: Response) => {
    if (!(await assertAdminOrManager(req, res))) return;
    const { userId } = req.params as { userId: string };
    if (!userId) {
      return sendResponse(res, 400, 'userId is required');
    }
    const permissions = await UserMetaService.getNavPermissionsForUser(userId);
    sendResponse(res, 200, 'Navigation permissions retrieved', { userId, permissions });
  });

  // PUT /api/v1/user-meta/admin/:userId/nav-permissions
  // Admin/manager-only: overwrite another user's navigation permissions.
  static setNavPermissionsForUser = requestHandler(async (req: AuthRequest, res: Response) => {
    if (!(await assertAdminOrManager(req, res))) return;
    const { userId } = req.params as { userId: string };
    if (!userId) {
      return sendResponse(res, 400, 'userId is required');
    }
    const body = (req.body ?? {}) as { permissions?: Record<string, unknown> };
    if (!body.permissions || typeof body.permissions !== 'object') {
      return sendResponse(res, 400, 'permissions object is required');
    }
    // Coerce values to plain booleans so we never store garbage.
    const sanitized: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(body.permissions)) {
      sanitized[k] = Boolean(v);
    }
    const result = await UserMetaService.setNavPermissionsForUser(userId, sanitized);
    sendResponse(res, 200, 'Navigation permissions updated', result);
  });

  // DELETE /api/v1/user-meta/:key - Delete user metadata by key
  static deleteUserMeta = requestHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, 'User not authenticated');
    }

    const { key } = req.params;

    if (!key) {
      return sendResponse(res, 400, 'Key is required');
    }

    const result = await UserMetaService.deleteUserMeta(userId, key);
    sendResponse(res, 200, 'User metadata deleted successfully', result);
  });
}
