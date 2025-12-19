import { Request, Response } from "express";
import { DashboardService } from "../service/dashboard.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class DashboardController {
    static getDashboardData = requestHandler(async (req: Request, res: Response) => {
        const { start, end } = req.query;
        const maintainsIds = Array.isArray(req.query.maintainsIds)
            ? (req.query.maintainsIds as string[])
            : (typeof req.query.maintainsIds === 'string' ? [req.query.maintainsIds] : undefined);
        const customerCategoryIds = Array.isArray(req.query.customerCategoryIds)
            ? (req.query.customerCategoryIds as string[])
            : (typeof req.query.customerCategoryIds === 'string' ? [req.query.customerCategoryIds] : undefined);

        if (!start || !end) {
            return sendResponse(res, 400, "Query params 'start' and 'end' are required");
        }

        const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$/;
        if (!isoRegex.test(start as string) || !isoRegex.test(end as string)) {
            return sendResponse(res, 400, "Invalid date format. Use ISO UTC (e.g., 2025-12-01T00:00:00.000Z)");
        }

        const filters = {
            start: start as string,
            end: end as string,
            maintainsIds,
            customerCategoryIds
        };

        const dashboardData = await DashboardService.getDashboardData(filters);
        sendResponse(res, 200, 'Dashboard data retrieved successfully', dashboardData);
    })
}
