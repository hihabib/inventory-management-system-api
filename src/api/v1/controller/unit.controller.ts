import { Response } from "express";
import { NewUnit } from "../drizzle/schema/unit";
import { AuthRequest } from "../middleware/auth";
import { UnitService } from "../service/unit.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class UnitController {
    static createUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { name, description } = req.body as NewUnit;
        const createdUnit = await UnitService.createUnit({ name, description });
        sendResponse(res, 201, 'Unit created successfully', createdUnit);
    })

    static updateUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const { name, description } = req.body as Partial<NewUnit>;
        const updatedUnit = await UnitService.updateUnit(id, { name, description });
        sendResponse(res, 200, 'Unit updated successfully', updatedUnit);
    })

    static deleteUnit = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const deletedUnit = await UnitService.deleteUnit(id);
        sendResponse(res, 200, 'Unit deleted successfully', deletedUnit);
    })

    static getUnits = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const units = await UnitService.getUnits(pagination, filter);
        sendResponse(res, 200, 'Units fetched successfully', units);
    })

    static getUnitById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const unit = await UnitService.getUnitById(id);
        if (!unit) {
            return sendResponse(res, 404, 'Unit not found', null);
        }
        sendResponse(res, 200, 'Unit fetched successfully', unit);
    })
}