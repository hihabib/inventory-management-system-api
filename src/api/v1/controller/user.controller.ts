import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UserService } from '../service/user.service';

export class UserController {
  // Register a new user
  static register = requestHandler(async (req: AuthRequest, res: Response) => {
    const { username, password, email, fullName, role, defaultRoute } = req.body;

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
      role: role || 'user',
      defaultRoute: defaultRoute
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

  // Get current user profile
  static getProfile = requestHandler(async (req: AuthRequest, res: Response) => {
    // req.user is set by authenticate middleware
    const user = req.user;

    sendResponse(res, 200, 'User profile retrieved successfully', user);
  });
}