import mongoose, { Schema } from "mongoose";

const preguntaSchema = new Schema({
    pregunta: {
        type: String,
        required: true,
        unique: true,
        minLength: 5,
        maxLength: 150
    },
    opcionUno: {
        type: String,
        required: true,
        unique: true,
        minLength: 1,
        maxLength: 100
    },
    opcionDos: {
        type: String,
        required: true,
        unique: true,
        minLength: 1,
        maxLength: 100
    },
    opcionTres: {
        type: String,
        required: true,
        unique: true,
        minLength: 1,
        maxLength: 100
    },
    opcionCorrecta: {
        type: String,
        required: true,
        unique: true,
        minLength: 1,
        maxLength: 100
    },
    nivel: {
        type: String,
        required: true,
        enum: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
    },
    usuario: {
        type: Schema.Types.ObjectId,
        ref: "usuario",
        required: true
    }
})

const Pregunta = mongoose.model('pregunta', preguntaSchema)

export default Pregunta