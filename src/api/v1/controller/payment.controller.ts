import { Request, Response } from "express";
import { PaymentService } from "../service/payment.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class PaymentController {
    static getPayments = requestHandler(async (req: Request, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const result = await PaymentService.getPayments(pagination, filter);
        sendResponse(res, 200, "Payments retrieved successfully", result);
    });
}