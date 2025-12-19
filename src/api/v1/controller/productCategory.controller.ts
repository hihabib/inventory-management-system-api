import { Request, Response } from "express";
import { NewProductCategory } from "../drizzle/schema/productCategory";
import { ProductCategoryService } from "../service/productCategory.service";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";

export class ProductCategoryController {
    static createProductCategory = requestHandler(async (req: Request, res: Response) => {
        const { name, description, parentId, vat } = req.body as NewProductCategory;
        const createdProductCategory = await ProductCategoryService.createProductCategory({ name, description, parentId, vat });
        sendResponse(res, 201, 'Product category created successfully', createdProductCategory);
    })

    static updateProductCategory = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const { name, description, parentId, vat } = req.body as Partial<NewProductCategory>;
        const updatedProductCategory = await ProductCategoryService.updateProductCategory(id, { name, description, parentId, vat });
        sendResponse(res, 200, 'Product category updated successfully', updatedProductCategory);
    })

    static deleteProductCategory = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const deletedProductCategory = await ProductCategoryService.deleteProductCategory(id);
        sendResponse(res, 200, 'Product category deleted successfully', deletedProductCategory);
    })

    static getProductCategories = requestHandler(async (req: Request, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const productCategories = await ProductCategoryService.getProductCategories(pagination, filter);
        sendResponse(res, 200, 'Product categories fetched successfully', productCategories);
    })

    static getProductCategoryById = requestHandler(async (req: Request, res: Response) => {
        const { id } = req.params;
        const productCategory = await ProductCategoryService.getProductCategoryById(id);
        if (!productCategory) {
            return sendResponse(res, 404, 'Product category not found', null);
        }
        sendResponse(res, 200, 'Product category fetched successfully', productCategory);
    })



}