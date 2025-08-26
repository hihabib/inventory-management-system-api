import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { CustomerController } from '../controller/customer.controller';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// Create customer
router.post('/', CustomerController.createCustomer);

// Get all customers
router.get('/', CustomerController.getAllCustomers);

// Get customer by ID
router.get('/:id', CustomerController.getCustomerById);

// Update customer
router.put('/:id', CustomerController.updateCustomer);

// Delete customer
router.delete('/:id', CustomerController.deleteCustomer);

export default router;