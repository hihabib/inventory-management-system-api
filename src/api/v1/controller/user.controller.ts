import { Response } from 'express';
import { eq } from 'drizzle-orm';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UserService } from '../service/user.service';
import { NewUser, userTable } from '../drizzle/schema/user';
import { roleTable } from '../drizzle/schema/role';
import { db } from '../drizzle/db';
import { getFilterAndPaginationFromRequest } from '../utils/filterWithPaginate';

// Returns true only when the calling user is an admin or manager. Sends the
// 401/403 response itself when not — callers should bail on `false`.
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

export class UserController {
  // Register a new user
  static register = requestHandler(async (req: AuthRequest, res: Response) => {
    const { username, password, email, fullName, roleId, maintainsId } = req.body as NewUser;

    // Check if user already exists
    const existingUser = await UserService.findByUsername(username) ||
      await UserService.findByEmail(email);

    if (existingUser) {
      return sendResponse(res, 409, 'Username or email already exists');
    }

    // Create new user
    const newUser = await UserService.createUser({
      username,
      password,
      email,
      fullName,
      roleId,
      maintainsId,
    });

    sendResponse(res, 201, 'User created successfully', newUser);
  });

  // Sign in user
  static signIn = requestHandler(async (req: AuthRequest, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendResponse(res, 400, 'Username and password are required');
    }

    const userAgent = (req.headers['user-agent'] as string | undefined) || '';
    const ipAddress = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || '';

    const result = await UserService.signIn(username, password, { userAgent, ipAddress });

    sendResponse(res, 200, 'Sign in successful', result);
  });

  static getUsers = requestHandler(async(req:AuthRequest,res:Response)=>{
    const {pagination, filter} = getFilterAndPaginationFromRequest(req);
    const search = req.query.s as string;
    const users = await UserService.getUsers(pagination, filter, search);
    sendResponse(res, 200, 'Users retrieved successfully', users);
  })

  // Get current user profile
  static getProfile = requestHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.id;
    if (!userId) {
      return sendResponse(res, 401, 'User not authenticated');
    }
    const user = await UserService.getUserByIdWithRoleMaintains(userId);
    sendResponse(res, 200, 'User profile retrieved successfully', user);
  });

  static updateUser = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
      return sendResponse(res, 400, 'User id is required');
    }
    const updates = req.body as Partial<NewUser>;
    const updated = await UserService.updateUser(id, updates);
    sendResponse(res, 200, 'User updated successfully', updated);
  });

  static getUserById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
      return sendResponse(res, 400, 'User id is required');
    }
    const user = await UserService.getUserByIdWithRoleMaintains(id);
    if (!user) {
      return sendResponse(res, 404, 'User not found');
    }
    sendResponse(res, 200, 'User retrieved successfully', user);
  });

  static deleteUser = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    if (!id) {
      return sendResponse(res, 400, 'User id is required');
    }
    const deleted = await UserService.deleteUser(id);
    if (!deleted) {
      return sendResponse(res, 404, 'User not found');
    }
    sendResponse(res, 200, 'User deleted successfully', deleted);
  });

  // POST /users/logout — revoke the caller's own session.
  static logout = requestHandler(async (req: AuthRequest, res: Response) => {
    const sessionId = req.user?.sessionId;
    if (!sessionId) {
      // No session id in the JWT (legacy token) — nothing to revoke server-side.
      return sendResponse(res, 200, 'Logged out');
    }
    await UserService.revokeSession(sessionId);
    sendResponse(res, 200, 'Logged out');
  });

  // GET /users/:id/sessions — admin/manager-only list of active sessions.
  // Pass ?includeRevoked=true for the full audit trail.
  static getSessionsForUser = requestHandler(async (req: AuthRequest, res: Response) => {
    if (!(await assertAdminOrManager(req, res))) return;
    const { id } = req.params as { id: string };
    if (!id) return sendResponse(res, 400, 'User id is required');
    const includeRevoked = req.query.includeRevoked === 'true';
    const sessions = await UserService.getSessionsForUser(id, includeRevoked);
    sendResponse(res, 200, 'User sessions retrieved', { sessions });
  });

  // DELETE /users/:id/sessions — admin/manager-only force-logout for every
  // active session of a user (signs them out on all devices).
  static revokeAllSessionsForUser = requestHandler(async (req: AuthRequest, res: Response) => {
    if (!(await assertAdminOrManager(req, res))) return;
    const { id } = req.params as { id: string };
    if (!id) return sendResponse(res, 400, 'User id is required');
    const revoked = await UserService.revokeAllSessionsForUser(id);
    sendResponse(res, 200, 'All sessions revoked', { revokedCount: revoked.length });
  });

  // DELETE /users/:id/sessions/:sessionId — admin/manager-only force-logout
  // of one specific device for a user.
  static revokeSpecificSession = requestHandler(async (req: AuthRequest, res: Response) => {
    if (!(await assertAdminOrManager(req, res))) return;
    const { sessionId } = req.params as { sessionId: string };
    if (!sessionId) return sendResponse(res, 400, 'sessionId is required');
    const updated = await UserService.revokeSession(sessionId);
    if (!updated) return sendResponse(res, 404, 'Session not found or already revoked');
    sendResponse(res, 200, 'Session revoked', updated);
  });
}
