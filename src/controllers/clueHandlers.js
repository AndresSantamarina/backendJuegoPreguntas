import Room from "../database/model/Room.js";
import { setNextTurn } from './gameLogic.js'

export const registerClueHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('submitClue', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId, clue } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode });

            if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
            if (room.status !== 'IN_GAME') return safeCallback({ success: false, message: "El juego no está en curso." });

            const playerIndexInPlayers = room.players.findIndex(p => p.userId.toString() === userId.toString());
            if (playerIndexInPlayers === -1) return safeCallback({ success: false, message: "No eres un jugador en esta sala." });

            const currentPlayer = room.players[playerIndexInPlayers];
            const currentTurnPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentTurnPlayerId.toString() !== userId.toString()) return safeCallback({ success: false, message: "No es tu turno." });

            if (currentPlayer.clueGiven) return safeCallback({ success: false, message: "Ya has dado tu pista para esta ronda." });
            if (!clue || clue.trim().length === 0) return safeCallback({ success: false, message: "La pista no puede estar vacía." });
            currentPlayer.clueGiven = clue.trim();
            await room.save();
            safeCallback({ success: true, message: "Pista enviada." });
            const updatedRoom = await Room.findOne({ roomId: roomCode });
            if (!updatedRoom) return;
            await setNextTurn(updatedRoom);

        } catch (error) {
            console.error("Error al enviar la pista (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al enviar la pista." });
        }
    });
}