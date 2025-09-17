import { Response } from "express";
import { NewProduct } from "../drizzle/schema/product";
import { AuthRequest } from "../middleware/auth";
import { ProductService } from "../service/product.service";
import { requestHandler } from "../utils/requestHandler";
import { sendResponse } from "../utils/response";
import { getFilterAndPaginationFromRequest } from "../utils/filterWithPaginate";

export class ProductController {
    static createProduct = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id: userId } = req.user
        const { name, bengaliName, sku, lowStockThreshold, mainUnitId, categoriesId, unitsId } = req.body as NewProduct & { unitsId: string[], categoriesId: string[] };
        const createdProduct = await ProductService.createProduct({
            name,
            bengaliName,
            sku,
            lowStockThreshold,
            mainUnitId,
            categoriesId,
            unitsId,
            createdBy: userId,
        });
        sendResponse(res, 201, 'Product created successfully', createdProduct);
    })

    static updateProduct = requestHandler(async (req: AuthRequest, res: Response) => {
        const { name, id, bengaliName, sku, lowStockThreshold, mainUnitId, categoriesId, unitsId } = req.body as Partial<NewProduct> & { id: string, unitsId?: string[], categoriesId?: string[] };
        const createdProduct = await ProductService.updateProduct({
            id,
            name,
            bengaliName,
            sku,
            lowStockThreshold,
            mainUnitId,
            categoriesId,
            unitsId
        });
        sendResponse(res, 201, 'Product updated successfully', createdProduct);
    })

    static getProducts = requestHandler(async (req: AuthRequest, res: Response) => {
        const { pagination, filter } = getFilterAndPaginationFromRequest(req);
        const products = await ProductService.getProducts(pagination, filter);
        sendResponse(res, 200, 'Products fetched successfully', products);
    })

    static getProductById = requestHandler(async (req: AuthRequest, res: Response) => {
        const { id } = req.params;
        const product = await ProductService.getProductById(id);
        
        if (!product) {
            return sendResponse(res, 404, 'Product not found', null);
        }
        
        sendResponse(res, 200, 'Product fetched successfully', product);
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