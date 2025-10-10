import { Router } from 'express';
import { StockController } from '../controller/stock.controller';

const router = Router();

router
    .delete('/:id', StockController.deleteStock)
    .put('/', StockController.updateStock)
    .post('/:id/check-availability', StockController.checkStockAvailability)
    .post('/', StockController.createStock)
    .post('/bulk', StockController.bulkCreateOrUpdateStock)
    .post('/bulk-add', StockController.bulkCreateOrAddStock)
    .get('/with-batch', StockController.getStocksWithBatch)
    .get('/batch/:batchId', StockController.getStocksByBatchId)
    .get('/:id/with-batch', StockController.getStockByIdWithBatch)
    .get('/', StockController.getStocks)

export default router;