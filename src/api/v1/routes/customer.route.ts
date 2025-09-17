import { Router } from "express";
import { CustomerController } from "../controller/customer.controller";

const router = Router();

router
    .put("/:id", CustomerController.updateCustomer)
    .delete("/:id", CustomerController.deleteCustomer)
    .get("/:id", CustomerController.getCustomerById)
    .get("/", CustomerController.getCustomers)
    .post("/", CustomerController.createCustomer)

export default router;