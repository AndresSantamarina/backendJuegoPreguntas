import mongoose, { Schema } from "mongoose";

const preguntaSchema = new Schema({
    pregunta: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 50
    },
    opcionUno: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 50
    },
    opcionDos: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 50
    },
    opcionTres: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 50
    },
    opcionCorrecta: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 50
    },
    nivel: {
        type: String,
        required: true,
        enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    }
})

const Pregunta = mongoose.model('pregunta', preguntaSchema)

export default Pregunta