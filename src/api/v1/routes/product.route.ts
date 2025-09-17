import { Router } from 'express';
import { ProductController } from '../controller/product.controller';

const router = Router();

router
    .delete('/:id', ProductController.deleteProduct)
    .put('/', ProductController.updateProduct)
    .get('/:id', ProductController.getProductById)
    .post('/', ProductController.createProduct)
    .get('/', ProductController.getProducts)



export default router;