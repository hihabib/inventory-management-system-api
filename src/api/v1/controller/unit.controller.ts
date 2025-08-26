import { Response } from 'express';
import { requestHandler } from '../utils/requestHandler';
import { sendResponse } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { UnitService } from '../service/unit.service';

export class UnitController {
    // Create a new unit
    static createUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { unitLabel, unitSuffix } = req.body;

        if (!unitLabel || !unitSuffix) {
            return sendResponse(res, 400, 'Unit label and suffix are required');
        }

        const unitData = {
            unitLabel,
            unitSuffix,
            createdBy: req.user?.id // If user is authenticated, use their ID
        };

        const newUnit = await UnitService.createUnit(unitData);

        sendResponse(res, 201, 'Unit created successfully', newUnit);
    });

    // Get all units
    static getAllUnits = requestHandler(async (req: AuthRequest, res: Response) => {
        const allUnits = await UnitService.getAllUnits();

        sendResponse(res, 200, 'Units retrieved successfully', allUnits);
    });

    // Get unit by ID
    static getUnitById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const unit = await UnitService.getUnitById(id);

        sendResponse(res, 200, 'Unit retrieved successfully', unit);
    });

    // Update unit
    static updateUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { unitLabel, unitSuffix } = req.body;

        const unitData: any = {};

        if (unitLabel !== undefined) unitData.unitLabel = unitLabel;
        if (unitSuffix !== undefined) unitData.unitSuffix = unitSuffix;

        const updatedUnit = await UnitService.updateUnit(id, unitData);

        sendResponse(res, 200, 'Unit updated successfully', updatedUnit);
    });

    // Delete unit
    static deleteUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;

        const result = await UnitService.deleteUnit(id);

        sendResponse(res, 200, result.message);
    });
}