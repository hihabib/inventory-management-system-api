// src/routes/sale.routes.ts

import { Router } from 'express';
import {SaleController} from '../controller/sale.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All sale routes require authentication
router.use(authenticate);

// Create a new sale record
router.post('/', SaleController.createSale);

// Get all sales for the authenticated user
router.get('/user', SaleController.getUserSales);

// Get a specific sale record by ID
router.get('/:id', SaleController.getSale);

// Delete a sale record
router.delete('/:id', SaleController.deleteSale);

export default router;