// src/routes/order.routes.ts

import { Router } from 'express';
import {OrderController} from '../controller/order.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

// All order routes require authentication
router.use(authenticate);

// Create a new order
router.post('/', OrderController.createOrder);

// Get all orders
router.get('/', OrderController.getAllOrders);

// Get an order by ID
router.get('/:id', OrderController.getOrder);

// Get orders by product ID
router.get('/product/:productId', OrderController.getOrdersByProduct);

// Get orders by outlet ID
router.get('/outlet/:outletId', OrderController.getOrdersByOutlet);

// Update an order
router.put('/:id', OrderController.updateOrder);

// Delete an order
router.delete('/:id', OrderController.deleteOrder);

export default router;