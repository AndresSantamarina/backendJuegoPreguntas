import Room from "../database/model/Room.js";
import { getSafeRoomData, resetRoundState, handleTwoPlayersGame } from './gameLogic.js';

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
    socket.on('impostorSubmitGuess', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId, guess } = data;
        const roomCode = roomId.toUpperCase();
        let outcomeMessage = '';
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

        try {
            let room = await Room.findOne({ roomId: roomCode });
            if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
            if (room.status !== 'IMPOSTOR_GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });

            const impostorPlayer = room.players.find(p => p.userId.toString() === userId.toString() && p.isImpostor);
            if (!impostorPlayer) return safeCallback({ success: false, message: "No eres el Impostor activo." });

            const correctWord = room.secretWord;

            if (guess.toLowerCase() === correctWord.toLowerCase()) {
                outcomeMessage = `¡Increíble! ${impostorPlayer.username} (Impostor) ha adivinado la palabra clave: **${correctWord}**. Conserva su vida.`;
                await resetAndEmitRound(room, roomCode, outcomeMessage);

            } else {
                impostorPlayer.lives -= 1;
                outcomeMessage = `¡Vaya! La adivinanza de ${impostorPlayer.username} fue incorrecta. Pierde una vida. La palabra era: **${correctWord}**. Vidas restantes: ${impostorPlayer.lives}.`;

                if (impostorPlayer.lives <= 0) {
                    impostorPlayer.isAlive = false;
                    outcomeMessage += ` El Impostor (${impostorPlayer.username}) ha sido **eliminado**.`;
                }

                const remainingAlivePlayers = room.players.filter(p => p.isAlive).length;

                if (remainingAlivePlayers === 1) {
                    const winnerPlayer = room.players.find(p => p.isAlive);
                    const winnerRole = winnerPlayer.isImpostor ? 'Impostor' : 'Innocents';

                    room.status = 'FINISHED';
                    outcomeMessage += ` ¡Solo queda ${winnerPlayer.username}! El juego termina. Ganan los **${winnerRole}**.`;

                    io.to(roomCode).emit('game_finished', {
                        winner: winnerRole,
                        message: outcomeMessage,
                        finalRoomState: getSafeRoomData(room)
                    });

                } else if (remainingAlivePlayers <= 0) {
                    room.status = 'FINISHED';
                    outcomeMessage += ` El juego termina en **empate**.`;

                    io.to(roomCode).emit('game_finished', {
                        winner: 'Tie',
                        message: outcomeMessage,
                        finalRoomState: getSafeRoomData(room)
                    });

                } else {
                    await resetAndEmitRound(room, roomCode, outcomeMessage);
                }
            }

            await room.save();

            if (room.status !== 'FINISHED' && !roundWasReset) {
                room = await Room.findOne({ roomId: roomCode });
            }

            safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });

        } catch (error) {
            console.error("Error en submitGuess:", error);
            safeCallback({ success: false, message: "Error interno del servidor al procesar la adivinanza." });
        }
    });
};
