import { Router } from "express";
import { ProductCategoryController } from "../controller/productCategory.controller";

const router = Router();

// CRUD operations
router.post("/", ProductCategoryController.createProductCategory);
router.get("/", ProductCategoryController.getProductCategories);
router.get("/:id", ProductCategoryController.getProductCategoryById);
router.put("/:id", ProductCategoryController.updateProductCategory);
router.delete("/:id", ProductCategoryController.deleteProductCategory);

export default router;