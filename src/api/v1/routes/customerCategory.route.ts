import { Router } from "express";
import { CustomerCategoryController } from "../controller/customerCategory.controller";

const router = Router();

router
    .post("/", CustomerCategoryController.createCustomerCategory)
    .put("/:id", CustomerCategoryController.updateCustomerCategory)
    .delete("/:id", CustomerCategoryController.deleteCustomerCategory)
    .get("/", CustomerCategoryController.getCustomerCategories)
    .get("/:id", CustomerCategoryController.getCustomerCategoryById);

export default router;