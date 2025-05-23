import Pregunta from "../database/model/Preguntas.js"

export const listarPreguntas = async (req, res) => {
    try {
        const preguntas = await Pregunta.find({ usuario: req.usuario._id });
        res.status(200).json(preguntas);
    } catch (error) {
        res.status(404).json({
            mensaje: "No se pudieron obtener las preguntas"
        });
    }
};

export const obtenerPregunta = async (req, res) => {
    try {
        const pregunta = await Pregunta.findOne({
            _id: req.params.id,
            usuario: req.usuario._id
        });

        if (!pregunta) {
            return res.status(404).json({
                mensaje: "Pregunta no encontrada o no tienes permisos"
            });
        }

        res.status(200).json(pregunta);
    } catch (error) {
        res.status(404).json({
            mensaje: "No se encontró la pregunta"
        });
    }
}

export const crearPregunta = async (req, res) => {
    try {
        const preguntaNueva = new Pregunta({
            ...req.body,
            usuario: req.usuario.id
        });
        await preguntaNueva.save();
        res.status(201).json({
            mensaje: "La pregunta fue creada correctamente"
        });
    } catch (error) {
        console.error(error);
        res.status(400).json({
            mensaje: "No se pudo crear la pregunta"
        });
    }
};

export const editarPregunta = async (req, res) => {
    try {
        const buscarPregunta = await Pregunta.findById(req.params.id)
        if (!buscarPregunta) {
            return res.status(404).json({
                mensaje: "No se pudo editar la pregunta, id incorrecto"
            })
        }
        await Pregunta.findByIdAndUpdate(req.params.id, req.body)
        res.status(200).json({
            mensaje: "La pregunta fue modificada correctamente"
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            mensaje: "Ocurrió un error al intentar editar la pregunta"
        })
    }
}

export const eliminarPregunta = async (req, res) => {
    try {
        const buscarPregunta = await Pregunta.findById(req.params.id)
        if (!buscarPregunta) {
            return res.status(404).json({
                mensaje: "No se pudo eliminar la pregunta, el id es incorrecto"
            })
        }
        await Pregunta.findByIdAndDelete(req.params.id)
        res.status(200).json({
            mensaje: "La pregunta fue eliminada exitosamente"
        })
    } catch (error) {
        console.error(error)
        res.status(500).json({
            mensaje: "Ocurrió un error al intentar eliminar el producto"
        })
    }
}

export const niveles = async (req, res) => {
    try {
        const todosLosNiveles = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
        res.status(200).json(todosLosNiveles);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            mensaje: "Error al obtener los niveles",
            error: error.message
        });
    }
}

export const preguntasPorNivel = async (req, res) => {
    try {
        const nivel = req.params.nivel;
        const preguntas = await Pregunta.find({
            nivel: nivel,
            usuario: req.usuario._id
        });
        res.status(200).json(preguntas);
    } catch (error) {
        console.error(error);
        res.status(500).json({
            mensaje: "Error al obtener preguntas del nivel"
        });
    }
};