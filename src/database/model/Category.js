import mongoose, { Schema } from "mongoose";

const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        enum: ['DEPORTES', 'VIDEOJUEGOS', 'PAISES', 'ANIMES']
    },
    words: {
        type: [String],
        required: true,
        validate: [val => val.length >= 16, 'Cada categoría debe tener al menos 16 palabras.']
    }
}, { timestamps: true });


const Category = mongoose.model('category', categorySchema)

export default Category