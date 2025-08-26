import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { OutletService } from '../service/outlet.service';

export class OutletController {
    // Create a new outlet
    static createOutlet = requestHandler(async (req: AuthRequest, res: Response) => {
        const { name, location, status } = req.body;

        if (!name || !location) {
            return sendResponse(res, 400, 'Outlet name and location are required');
        }

        const outletData = {
            name,
            location,
            status: status || 'active',
            createdBy: req.user?.id // If user is authenticated, use their ID
        };

        const newOutlet = await OutletService.createOutlet(outletData);

        sendResponse(res, 201, 'Outlet created successfully', newOutlet);
    });

    // Get all outlets
    static getAllOutlets = requestHandler(async (req: AuthRequest, res: Response) => {
        const allOutlets = await OutletService.getAllOutlets();

        sendResponse(res, 200, 'Outlets retrieved successfully', allOutlets);
    });

    // Get outlet by ID
    static getOutletById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const outlet = await OutletService.getOutletById(id);

        sendResponse(res, 200, 'Outlet retrieved successfully', outlet);
    });

    // Update outlet
    static updateOutlet = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { name, location, status } = req.body;

        const outletData: any = {};

        if (name !== undefined) outletData.name = name;
        if (location !== undefined) outletData.location = location;
        if (status !== undefined) outletData.status = status;

        const updatedOutlet = await OutletService.updateOutlet(id, outletData);

        sendResponse(res, 200, 'Outlet updated successfully', updatedOutlet);
    });

    // Delete outlet
    static deleteOutlet = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const result = await OutletService.deleteOutlet(id);

        sendResponse(res, 200, result.message);
    });
}