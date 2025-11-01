import Room from "../database/model/Room.js";
import Category from "../database/model/Category.js"
import User from "../database/model/User.js";
import { io } from "../../index.js";


export const getRoomStatus = async (req, res) => {
    try {
        const room = await Room.findOne({ roomId: req.params.roomId.toUpperCase() })
            .populate('categoryId', 'name');

        if (!room) return res.status(404).json({ message: "Sala no encontrada." });

        const userId = req.usuario.id;
        const isPlayer = room.players.some(p => p.userId.toString() === userId.toString());

        if (!isPlayer) return res.status(403).json({ message: "No eres un jugador de esta sala." });

        // Devolver la sala completa (incluyendo la palabra clave si está en juego para el inocente)
        const roomData = getSafeRoomData(room);
        const player = room.players.find(p => p.userId.toString() === userId.toString());

        // Información sensible solo para el jugador que la solicita
        roomData.userRole = {
            isImpostor: player.isImpostor,
            secretWord: !player.isImpostor ? room.secretWord : "Eres el Impostor",
        };

        res.status(200).json(roomData);

    } catch (error) {
        console.error("Error al obtener estado de la sala:", error);
        res.status(500).json({ message: "Error interno del servidor." });
    }
};

export const listCategories = async (req, res) => {
    try {
        const categories = await Category.find({}, 'name -_id');
        const categoryNames = categories.map(cat => cat.name);
        res.status(200).json(categoryNames);
    } catch (error) {
        console.error("Error al obtener categorías:", error);
        res.status(500).json({ message: "Error al obtener categorías." });
    }
};