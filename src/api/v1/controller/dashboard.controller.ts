import { Request, Response } from "express";
import { DashboardService } from "../service/dashboard.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class DashboardController {
    static getDashboardData = requestHandler(async (_req: Request, res: Response) => {
        const dashboardData = await DashboardService.getDashboardData();
        sendResponse(res, 200, 'Dashboard data retrieved successfully', dashboardData);
    })
}