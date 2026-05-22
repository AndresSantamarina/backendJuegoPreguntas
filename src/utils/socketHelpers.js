import Room from "../database/model/Room.js";

export const withRoomContext = async (roomId, userId, callback, action) => {
    const safeCallback = (response) => {
        if (typeof callback === 'function') callback(response);
    };

    const roomCode = roomId?.toUpperCase();

    try {
        const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

        if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });

        const player = room.players.find(p => p.userId.toString() === userId.toString());
        if (!player) return safeCallback({ success: false, message: "No eres un jugador en esta sala." });

        // Ejecutamos la lógica específica pasando la sala y el jugador listos para usarse
        await action(room, player, safeCallback, roomCode);
    } catch (error) {
        console.error("Socket Action Error:", error);
        safeCallback({ success: false, message: "Error interno del servidor." });
    }
};