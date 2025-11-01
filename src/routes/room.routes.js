import { Router } from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getRoomStatus, listCategories } from "../controllers/room.controllers.js";

const router = Router();

router.route("/categories")
    .get(listCategories);

router.route("/status/:roomId")
    .get(protect, getRoomStatus);

export default router;