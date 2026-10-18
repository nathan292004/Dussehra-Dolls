import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import productsRouter from "./products";
import cartRouter from "./cart";
import ordersRouter from "./orders";
import chitsRouter from "./chits";
import walletRouter from "./wallet";
import adminRouter from "./admin";
import paymentRouter from "./payment";
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
router.use("/admin", adminRouter);
router.use("/payment", paymentRouter);
router.use("/whatsapp", whatsappRouter);
router.use("/addresses", addressesRouter);

export default router;
