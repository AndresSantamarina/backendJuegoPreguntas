import Pregunta from "../database/model/pregunta.js"

export const listarPreguntas = async (req, res) => {
try {
    const preguntas = await Pregunta.find()
    res.status(200).json(preguntas)
} catch (error) {
    res.status(404).json({
        mensaje: "No se pudieron obtener las preguntas"
    })
}
}

export const obtenerPregunta = async (req, res) => {
try {
    const preguntaBuscada = await Pregunta.findById(req.params.id)
    res.status(200).json(preguntaBuscada)
} catch (error) {
    res.status(404).json({
        mensaje:"No se encontró la pregunta"
    })
}
}

export const crearPregunta = async (req,res)=>{
try {
    const preguntaNueva = new Pregunta(req.body)
    await preguntaNueva.save()
    res.status(201).json({
        mensaje: "La pregunta fue creada correctamente"
    })
} catch (error) {
    console.error(error)
    res.status(400).json({
        mensaje: "No se pudo crear la pregunta"
    })
}
}

export const editarPregunta = async(req, res) => {
try {
    const buscarPregunta = await Pregunta.findById(req.params.id)
    if(!buscarPregunta){
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

export const eliminarPregunta = async (req,res) => {
    try {
        const buscarPregunta = await Pregunta.findById(req.params.id)
        if(!buscarPregunta){
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
      const niveles = Pregunta.schema.path('nivel').enumValues;
      res.status(200).json(niveles);
    } catch (error) {
      console.error(error)
      res.status(404).json({
        mensaje: "No se pudieron obtener los niveles"
      })
    }
  }

export const preguntasPorNivel = async (req, res) => {
    try {
      const nivel = req.params.nivel;
      const preguntas = await Pregunta.find({
        nivel: nivel
      });
      res.status(200).json(preguntas);
    } catch (error) {
      console.error(error);
      res.status(500).json({
        mensaje: "Error del servidor, no se pudo obtener la lista de preguntas.",
        error: error
      });
    }
  };