import { Request, Response } from "express";
import { NewRole } from "../drizzle/schema/role";
import { RoleService } from "../service/role.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { FilterOptions, getFilterAndPaginationFromRequest, PaginationOptions } from "../utils/filterWithPaginate";

export class RoleController {
    static createRole = requestHandler(async (req: Request, res: Response) => {
        const {name, description, defaultRoute} = req.body as NewRole;
        const createdRole = await RoleService.createRole({name, description, defaultRoute});
        sendResponse(res, 201, 'Role created successfully', createdRole);
    })

    static getRoles = requestHandler(async (req: Request, res: Response) => {
        const {pagination, filter} = getFilterAndPaginationFromRequest(req);
        const roles = await RoleService.getRoles(pagination, filter);
        sendResponse(res, 200, 'Roles fetched successfully', roles);
    })

    static deleteRole = requestHandler(async (req: Request, res: Response) => {
        const deleted = await RoleService.deleteRole(req.params.id);
        sendResponse(res, 200, 'Role deleted successfully', deleted);
    })

    static updateRole = requestHandler(async (req: Request, res: Response) => {
        const {name, description} = req.body as NewRole;
        const updated = await RoleService.updateRole(req.params.id, {name, description});
        sendResponse(res, 200, 'Role updated successfully', updated);
    })

    static getRole = requestHandler(async (req: Request, res: Response) => {
        const role = await RoleService.getRole(req.params.id);
        sendResponse(res, 200, 'Role fetched successfully', role);
    })
}