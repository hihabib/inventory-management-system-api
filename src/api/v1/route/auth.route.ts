import { Router } from "express";
import * as controller from '../controller/auth.controller'
const router = Router();

router.post("/signin", controller.signin)


export default router;