import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productsRouter from "./products";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import chitsRouter from "./chits";
import walletRouter from "./wallet";
import adminRouter from "./admin";
import adminAuthRouter from "./admin-auth";
import { requireAdmin } from "../middlewares/admin-auth";
import paymentRouter from "./payment";
import razorpayWebhookRouter from "./razorpay-webhook";
import whatsappRouter from "./whatsapp";
import addressesRouter from "./addresses";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/products", productsRouter);
router.use("/cart", cartRouter);
router.use("/orders", ordersRouter);
router.use("/chits", chitsRouter);
router.use("/wallet", walletRouter);
// Login is public; everything else under /admin requires a valid admin token.
router.use("/admin/auth", adminAuthRouter);
router.use("/admin", requireAdmin as any, adminRouter);
// Called by Razorpay itself (no customer login); must come before the authenticated payment routes.
router.use("/payment/razorpay-webhook", razorpayWebhookRouter);
router.use("/payment", paymentRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/addresses", addressesRouter);

export default router;
