import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UserService } from '../service/user.service';
import { NewUser } from '../drizzle/schema/user';
import { getFilterAndPaginationFromRequest } from '../utils/filterWithPaginate';

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

    const result = await UserService.signIn(username, password);

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
}
