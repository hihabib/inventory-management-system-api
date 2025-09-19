import { Router } from 'express';
import { StockController } from '../controller/stock.controller';

const router = Router();

router
    .delete('/:id', StockController.deleteStock)
    .put('/', StockController.updateStock)
    .post('/', StockController.createStock)
    .post('/bulk', StockController.bulkCreateOrUpdateStock)
    .post('/bulk-add', StockController.bulkCreateOrAddStock)
    .get('/', StockController.getStocks)

export default router;