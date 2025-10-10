import { Router } from 'express';
import { StockBatchController } from '../controller/stockBatch.controller';

const router = Router();

router
    // Batch management
    // POST / - Create new stock batch (now accepts mainUnitQuantity and manual unitPrices array)
    .post('/', StockBatchController.addNewStockBatch)
    .get('/', StockBatchController.getBatches)
    .get('/:id', StockBatchController.getBatchById)
    
    // Stock operations within batches
    .get('/stock/:id', StockBatchController.getStockById)
    .get('/batch/:batchId/stocks', StockBatchController.getStocksByBatch)
    .get('/batch/:batchId/details', StockBatchController.getBatchWithStocks)
    
    // Sale processing (now accepts mainUnitQuantityToReduce)
    // POST /process-sale/by-stock - Process sale by stock ID with main unit quantity
    .post('/process-sale/by-stock', StockBatchController.processSaleByStockId)
    // POST /process-sale/by-batch-unit/:batchId - Process sale by batch with main unit quantity
    .post('/process-sale/by-batch-unit/:batchId', StockBatchController.processSaleByBatchAndUnit)
    
    // Product stock availability
    .get('/product/:productId/available-stock', StockBatchController.getAvailableStockForProduct)

    // Update operations (now accept mainUnitQuantity and manual unitPrices array)
    // PUT /:id - Update batch information
    .put("/:id", StockBatchController.updateBatch)
    // PUT /stock/:stockId - Update individual stock with main unit values
    .put("/stock/:stockId", StockBatchController.updateStock)
    // PUT /batch/:batchId/stocks - Update all stocks in batch with main unit values
    .put("/batch/:batchId/stocks", StockBatchController.updateBatchStocks)

export default router;