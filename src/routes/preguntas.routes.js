import { Router } from "express";
import { crearPregunta, editarPregunta, eliminarPregunta, listarPreguntas, niveles, obtenerPregunta, preguntasPorNivel } from "../controllers/preguntas.controllers.js";
import { protect } from "../middleware/authMiddleware.js";

const router = Router();

// router.route("/preguntas")
//     .get(protect, listarPreguntas)
//     .post(protect, crearPregunta);

// router.route("/pregunta/:id")
//     .get(protect, obtenerPregunta)
//     .put(protect, editarPregunta)
//     .delete(protect, eliminarPregunta);

// router.route('/preguntas/niveles')
//     .get(protect, niveles);

// router.route("/preguntas/nivel/:nivel")
//     .get(protect, preguntasPorNivel);

router.route("/")
    .get(protect, listarPreguntas)
    .post(protect, crearPregunta);

router.route('/niveles')
    .get(protect, niveles);

router.route("/nivel/:nivel")
    .get(protect, preguntasPorNivel);

router.route("/:id")
    .get(protect, obtenerPregunta)
    .put(protect, editarPregunta)
    .delete(protect, eliminarPregunta);





export default router;