import { Router } from 'express';
import { ProductController } from '../controller/product.controller';

const router = Router();

router
    .delete('/:id', ProductController.deleteProduct)
    .put('/with-units', ProductController.updateProductWithUnits)
    .get('/:id/unit-conversions', ProductController.getProductUnitConversions)
    .get('/:id', ProductController.getProductById)
    .post('/with-units', ProductController.createProductWithUnits)
    .get('/', ProductController.getProducts)



export default router;