import { Router } from 'express';
import userRoutes from './user.route';
import roleRoutes from './role.route'
import productRoutes from './product.route'
import { authMiddleware } from '../middleware/auth';
import stockRoutes from './stock.route'
import unitRoutes from './unit.route'
import productCategoryRoutes from './productCategory.route'
import maintainsRoutes from './maintains.route'
import customerRoutes from './customer.route'
import customerCategoryRoutes from './customerCategory.route'
import saleRoutes from './sale.route'
import paymentRoutes from './payment.route'
import dashboardRoutes from './dashboard.route'
import deliveryHistoryRoutes from './deliveryHistory.route'
import stockBatchRoutes from './stockBatch.route'
import customerDueRoutes from '../route/customerDue.route'
const router = Router();

router.use("/users", userRoutes);
router.use("/roles", roleRoutes);
router.use("/products", [authMiddleware], productRoutes);
router.use("/stocks", [authMiddleware], stockRoutes);
router.use("/stock-batches", [authMiddleware], stockBatchRoutes);
router.use("/units", [authMiddleware], unitRoutes);
router.use("/product-categories", [authMiddleware], productCategoryRoutes);
router.use("/maintains", [authMiddleware], maintainsRoutes);
router.use("/customers", [authMiddleware], customerRoutes);
router.use("/customer-categories", [authMiddleware], customerCategoryRoutes);
router.use("/sales", [authMiddleware], saleRoutes);
router.use("/payments", [authMiddleware], paymentRoutes);
router.use("/dashboard", [authMiddleware], dashboardRoutes);
router.use("/delivery-histories", [authMiddleware], deliveryHistoryRoutes);
router.use("/customer-due", customerDueRoutes);

export default router;