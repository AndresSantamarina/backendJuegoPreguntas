import { Router } from "express";
import { crearPregunta, editarPregunta, eliminarPregunta, listarPreguntas, niveles, obtenerPregunta, preguntasPorNivel } from "../controllers/preguntas.controllers.js";

const router = Router();

router.route("/preguntas").get(listarPreguntas).post(crearPregunta)
router.route("/pregunta/:id").get(obtenerPregunta).put(editarPregunta).delete(eliminarPregunta)
router.route('/preguntas/niveles').get(niveles)
router.route("/preguntas/nivel/:nivel").get(preguntasPorNivel);


export default router;