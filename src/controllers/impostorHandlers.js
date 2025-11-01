import Room from "../database/model/Room.js";
import { getSafeRoomData, resetRoundState, handleTwoPlayersGame } from './gameLogic.js'; // ⬅️ Nuevo Import

export const registerImpostorHandlers = (socket, io, userId, userName) => {
    // Definición de utilidades específicas para este handler
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('chooseTarget', async (data, callback) => {
        let roundWasReset = false; // 🛑 Bandera de sincronización para este handler
        const resetAndEmitRound = async (room, roomCode, baseMessage) => {
            // LLama a resetRoundState, que ROTARÁ el impostor.
            const isTwoPlayerMode = await resetRoundState(room);
            roundWasReset = true; // Marcamos que el documento Mongoose fue modificado externamente

            // Si resetRoundState no activó el modo de 2 jugadores...
            if (!isTwoPlayerMode) {
                // Asumimos que resetRoundState ya guardó la sala
                io.to(roomCode).emit('round_new', {
                    ...getSafeRoomData(room),
                    message: baseMessage + ` La ronda ${room.currentRound} comienza.`
                });
            }
            // Si es modo 2 jugadores, handleTwoPlayersGame ya emitió el evento 'guessing_started'
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

            // Verificar el rol del atacante (¡Debe ser el impostor ACTUAL!)
            if (!killer || !killer.isImpostor) return safeCallback({ success: false, message: "Solo el Impostor puede atacar." });
            if (!victim || !victim.isAlive) return safeCallback({ success: false, message: "Objetivo no válido." });

            // El ataque se realiza: la víctima pierde una vida.
            victim.lives -= 1;
            let outcomeMessage = `${victim.username} fue atacado(a) por el Impostor. Vidas restantes: ${victim.lives}.`;

            if (victim.lives <= 0) {
                victim.isAlive = false;
                outcomeMessage += ` ${victim.username} ha sido eliminado(a).`;
            }
            const aliveInnocents = room.players.filter(p => p.isAlive && !p.isImpostor).length;
            const currentAliveCount = room.players.filter(p => p.isAlive).length;

            if (aliveInnocents === 0) {
                // FIN DE JUEGO: Impostor gana
                room.status = 'FINISHED';
                outcomeMessage += ` El Impostor (${killer.username}) gana.`;

                io.to(roomCode).emit('game_finished', {
                    winner: 'Impostor',
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (currentAliveCount === 2) {
                // Modo de 2 jugadores
                await handleTwoPlayersGame(room);
                roundWasReset = true; // handleTwoPlayersGame también puede cambiar el estado de la sala
                outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
            } else {
                // Reiniciar la ronda (Esto rotará el impostor para la próxima vez)
                await resetAndEmitRound(room, roomCode, outcomeMessage);
            }

            await room.save();
            // 🛑 LÓGICA DE SINCRONIZACIÓN DE ESTADO PARA EL CALLBACK
            if (roundWasReset || room.status !== 'IMPOSTOR_CHOOSING') {
                // Re-cargamos el documento para obtener el estado más fresco
                room = await Room.findOne({ roomId: roomCode });
            }
            safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });

        } catch (error) {
            console.error("Error en submitKillTarget:", error);
            safeCallback({ success: false, message: "Error interno del servidor al procesar el ataque." });
        }
    });
};
