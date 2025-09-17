import { Request, Response } from "express";
import { NewMaintains } from "../drizzle/schema/maintains";
import { MaintainsService } from "../service/maintains.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class MaintainsController {
    static createMaintains = requestHandler(async (req: Request, res: Response) => {
        const { name, description, type } = req.body as NewMaintains;
        const createdMaintains = await MaintainsService.createMaintains({ name, description, type });
        sendResponse(res, 201, 'Maintains created successfully', createdMaintains);
    })

    static updateMaintains = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, description, type } = req.body as Partial<NewMaintains>;
        const updatedMaintains = await MaintainsService.updateMaintains(id, { name, description, type });
        sendResponse(res, 200, 'Maintains updated successfully', updatedMaintains);
    })

    static deleteMaintains = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const deletedMaintains = await MaintainsService.deleteMaintains(id);
        sendResponse(res, 200, 'Maintains deleted successfully', deletedMaintains);
    })

    static getMaintains = requestHandler(async (req: Request, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const maintains = await MaintainsService.getMaintains(pagination, filter);
        sendResponse(res, 200, 'Maintains fetched successfully', maintains);
    })

    static getMaintainsById = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const maintains = await MaintainsService.getMaintainsById(id);
        if (!maintains) {
            return sendResponse(res, 404, 'Maintains not found', null);
        }
        sendResponse(res, 200, 'Maintains fetched successfully', maintains);
    })
}