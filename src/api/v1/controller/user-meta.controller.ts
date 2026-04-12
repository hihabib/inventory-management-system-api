import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UserMetaService } from '../service/user-meta.service';

interface PutUserMetaBody {
  key: string;
  value: any;
  merge?: boolean;
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
