import { Router } from 'express';
import userRoutes from './user.route';
import unitRoutes from './unit.route';
import outletRoutes from './outlet.route';
import customerCategoryRoutes from './customerCategory.routes'
import customerRoutes from './customer.routes'
import productCategoryRoutes from './productCategory.routes';

const router = Router();

router.use("/users", userRoutes);
router.use("/units", unitRoutes);
router.use("/outlets", outletRoutes);
router.use('/customer-categories', customerCategoryRoutes);
router.use('/customers', customerRoutes);
router.use('/product-categories', productCategoryRoutes);

export default router;