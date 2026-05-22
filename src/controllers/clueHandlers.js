import { setNextTurn } from './gameLogic.js';
import { withRoomContext } from '../utils/socketHelpers.js';

export const registerClueHandlers = (socket, io, userId, userName) => {
    socket.on('submitClue', (data, callback) => {
        const { roomId, clue } = data;

        withRoomContext(roomId, userId, callback, async (room, currentPlayer, safeCallback, roomCode) => {
            if (room.status !== 'IN_GAME') return safeCallback({ success: false, message: "El juego no está en curso." });
            const currentTurnPlayerId = room.turnOrder[room.currentTurnIndex];
            if (currentTurnPlayerId.toString() !== userId.toString()) return safeCallback({ success: false, message: "No es tu turno." });
            if (currentPlayer.clueGiven) return safeCallback({ success: false, message: "Ya has dado tu pista para esta ronda." });
            if (!clue || clue.trim().length === 0) return safeCallback({ success: false, message: "La pista no puede estar vacía." });
            currentPlayer.clueGiven = clue.trim();
            await room.save();
            safeCallback({ success: true, message: "Pista enviada." });
            await setNextTurn(room);
        });
    });
}