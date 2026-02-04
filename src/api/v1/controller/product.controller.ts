import { Response } from "express";
import { NewProduct } from "../drizzle/schema/product";
import { AuthRequest } from "../middleware/auth";
import { ProductService } from "../service/product.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";

export class ProductController {
    static createProductWithUnits = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id: userId } = req.user
        const { name, bengaliName, sku, lowStockThreshold, mainUnitId, defaultOrderUnit, categoriesId, unitConversions, isActive } = req.body as NewProduct & { 
            unitConversions: Array<{ unitId: string; conversionFactor: number }>, 
            categoriesId: string[] 
        };
        const createdProduct = await ProductService.createProductWithUnits({
            name,
            bengaliName,
            sku,
            lowStockThreshold,
            mainUnitId,
            defaultOrderUnit,
            categoriesId,
            unitConversions,
            isActive,
            createdBy: userId,
        });
        sendResponse(res, 201, 'Product created with units successfully', createdProduct);
    })

    static updateProductWithUnits = requestHandler(async (req: AuthRequest, res: Response) => {
        const { name, id, bengaliName, sku, lowStockThreshold, mainUnitId, defaultOrderUnit, categoriesId, unitConversions, isActive } = req.body as Partial<NewProduct> & { 
            id: string, 
            unitConversions?: Array<{ unitId: string; conversionFactor: number }>, 
            categoriesId?: string[] 
        };
        const updatedProduct = await ProductService.updateProductWithUnits({
            id,
            name,
            bengaliName,
            sku,
            lowStockThreshold,
            mainUnitId,
            defaultOrderUnit,
            categoriesId,
            unitConversions,
            isActive
        });
        sendResponse(res, 200, 'Product updated with units successfully', updatedProduct);
    })

    static getProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const products = await ProductService.getProducts(pagination, filter);
        sendResponse(res, 200, 'Products fetched successfully', products);
    })

    static getProductById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const product = await ProductService.getProductById(id);
        sendResponse(res, 200, 'Product fetched successfully', product);
    })

    static getProductUnitConversions = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const unitConversions = await ProductService.getProductUnitConversions(id);
        sendResponse(res, 200, 'Product unit conversions fetched successfully', unitConversions);
    })

    static deleteProduct = requestHandler(async (req: AuthRequest, res: Response) => {
        const deleted = await ProductService.deleteProduct(req.params.id);
        sendResponse(res, 200, 'Product deleted successfully', deleted);
    })

    // static updateRole = requestHandler(async (req: Request, res: Response) => {
    //     const {name, description} = req.body as NewRole;
    //     const updated = await RoleService.updateRole(req.params.id, {name, description});
    //     sendResponse(res, 200, 'Role updated successfully', updated);
    // })

    // static getRole = requestHandler(async (req: Request, res: Response) => {
    //     const role = await RoleService.getRole(req.params.id);
    //     sendResponse(res, 200, 'Role fetched successfully', role);
    // })
}