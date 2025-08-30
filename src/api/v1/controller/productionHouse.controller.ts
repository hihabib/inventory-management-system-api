import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { ProductionHouseService } from '../service/productionHouse.service';
import { ProductionHouse } from '../drizzle/schema/productionHouse';

export class ProductionHouseController {
  // Create a new production house
  static createProductionHouse = requestHandler(async (req: AuthRequest, res: Response) => {
    const { name, location, status, assignedTo } = req.body;

    if (!name || !location || !assignedTo) {
      return sendResponse(res, 400, 'Production house name, location, and assignedTo are required');
    }

    const houseData = {
      name,
      location,
      status: status || 'active',
      assignedTo,
      createdBy: req.user?.id // If user is authenticated, use their ID
    };

    const newHouse = await ProductionHouseService.createProductionHouse(houseData);

    sendResponse(res, 201, 'Production house created successfully', newHouse);
  });

  // Get all production houses
  static getAllProductionHouses = requestHandler(async (req: AuthRequest, res: Response) => {
    const allHouses = await ProductionHouseService.getAllProductionHouses();

    sendResponse(res, 200, 'Production houses retrieved successfully', allHouses);
  });

  // Get production house by ID
  static getProductionHouseById = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const house = await ProductionHouseService.getProductionHouseById(id);

    sendResponse(res, 200, 'Production house retrieved successfully', house);
  });

  // Update production house
  static updateProductionHouse = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { name, location, status, assignedTo } = req.body;

    const houseData: Partial<ProductionHouse> = {};

    if (name !== undefined) houseData.name = name;
    if (location !== undefined) houseData.location = location;
    if (status !== undefined) houseData.status = status;
    if (assignedTo !== undefined) houseData.assignedTo = assignedTo;

    const updatedHouse = await ProductionHouseService.updateProductionHouse(id, houseData);

    sendResponse(res, 200, 'Production house updated successfully', updatedHouse);
  });

  // Delete production house
  static deleteProductionHouse = requestHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params;

    const result = await ProductionHouseService.deleteProductionHouse(id);

    sendResponse(res, 200, result.message);
  });


  // Get production house by assigned user ID
  static getProductionHouseByAssignedUserId = requestHandler(async (req: AuthRequest, res: Response) => {
    const { userId } = req.params;

    if (!userId) {
      return sendResponse(res, 400, 'User ID is required');
    }

    const productionHouse = await ProductionHouseService.getProductionHouseByAssignedUserId(userId);

    sendResponse(res, 200, 'Production house retrieved successfully', productionHouse);
  });
}