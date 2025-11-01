import Room from "../database/model/Room.js";
import { getSafeRoomData, resetRoundState, handleTwoPlayersGame } from './gameLogic.js'; // ⬅️ Nuevo Import

export const registerImpostorHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('chooseTarget', async (data, callback) => {
        let roundWasReset = false;
        const resetAndEmitRound = async (room, roomCode, baseMessage) => {
            const isTwoPlayerMode = await resetRoundState(room);
            roundWasReset = true;
            if (!isTwoPlayerMode) {
                io.to(roomCode).emit('round_new', {
                    ...getSafeRoomData(room),
                    message: baseMessage + ` La ronda ${room.currentRound} comienza.`
                });
            }
        };
        const safeCallback = createSafeCallback(callback);
        const { roomId, targetId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            let room = await Room.findOne({ roomId: roomCode });
            if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
            if (room.status !== 'IMPOSTOR_CHOOSING') return safeCallback({ success: false, message: "No es el momento de elegir un objetivo." });
            const killer = room.players.find(p => p.userId.toString() === userId.toString());
            const victim = room.players.find(p => p.userId.toString() === targetId.toString());
            if (!killer || !killer.isImpostor) return safeCallback({ success: false, message: "Solo el Impostor puede atacar." });
            if (!victim || !victim.isAlive) return safeCallback({ success: false, message: "Objetivo no válido." });
            victim.lives -= 1;
            let outcomeMessage = `${victim.username} fue atacado(a) por el Impostor. Vidas restantes: ${victim.lives}.`;

            if (victim.lives <= 0) {
                victim.isAlive = false;
                outcomeMessage += ` ${victim.username} ha sido eliminado(a).`;
            }
            const aliveInnocents = room.players.filter(p => p.isAlive && !p.isImpostor).length;
            const currentAliveCount = room.players.filter(p => p.isAlive).length;

            if (aliveInnocents === 0) {
                room.status = 'FINISHED';
                outcomeMessage += ` El Impostor (${killer.username}) gana.`;

                io.to(roomCode).emit('game_finished', {
                    winner: 'Impostor',
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (currentAliveCount === 2) {
                await handleTwoPlayersGame(room);
                roundWasReset = true;
                outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
            } else {
                await resetAndEmitRound(room, roomCode, outcomeMessage);
            }

            await room.save();
            if (roundWasReset || room.status !== 'IMPOSTOR_CHOOSING') {
                room = await Room.findOne({ roomId: roomCode });
            }
            safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });

        } catch (error) {
            console.error("Error en submitKillTarget:", error);
            safeCallback({ success: false, message: "Error interno del servidor al procesar el ataque." });
        }
    });
};
