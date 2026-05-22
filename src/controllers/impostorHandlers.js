import { getSafeRoomData, resetRoundState, handleTwoPlayersGame } from './gameLogic.js';
import { withRoomContext } from '../utils/socketHelpers.js';

export const registerImpostorHandlers = (socket, io, userId, userName) => {

    socket.on('chooseTarget', (data, callback) => {
        const { roomId, targetId } = data;

        withRoomContext(roomId, userId, callback, async (room, killer, safeCallback, roomCode) => {
            if (room.status !== 'IMPOSTOR_CHOOSING') return safeCallback({ success: false, message: "No es el momento de elegir un objetivo." });

            const victim = room.players.find(p => p.userId.toString() === targetId.toString());
            if (!killer.isImpostor) return safeCallback({ success: false, message: "Solo el Impostor puede atacar." });
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
                await room.save();

                io.to(roomCode).emit('game_finished', {
                    winner: 'Impostor',
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (currentAliveCount === 2) {
                await handleTwoPlayersGame(room);
                outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
                await room.save();
            } else {
                const isTwoPlayerMode = await resetRoundState(room);
                if (!isTwoPlayerMode) {
                    io.to(roomCode).emit('round_new', {
                        ...getSafeRoomData(room),
                        message: outcomeMessage + ` La ronda ${room.currentRound} comienza.`
                    });
                }
            }

            safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });
        });
    });

    socket.on('impostorSubmitGuess', (data, callback) => {
        const { roomId, guess } = data;

        withRoomContext(roomId, userId, callback, async (room, impostorPlayer, safeCallback, roomCode) => {
            if (room.status !== 'IMPOSTOR_GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });
            if (!impostorPlayer.isImpostor) return safeCallback({ success: false, message: "No eres el Impostor activo." });

            const correctWord = room.secretWord;
            let outcomeMessage = '';

            const resetAndEmitRoundLocal = async (roomObj, baseMsg) => {
                const isTwoPlayerMode = await resetRoundState(roomObj);
                if (!isTwoPlayerMode) {
                    io.to(roomCode).emit('round_new', {
                        ...getSafeRoomData(roomObj),
                        message: baseMsg + ` La ronda ${roomObj.currentRound} comienza.`
                    });
                }
            };

            if (guess.toLowerCase() === correctWord.toLowerCase()) {
                outcomeMessage = `¡Increíble! ${impostorPlayer.username} ha adivinado la palabra clave: ${correctWord}. Conserva su vida.`;
                await resetAndEmitRoundLocal(room, outcomeMessage);
            } else {
                impostorPlayer.lives -= 1;
                outcomeMessage = `¡Vaya! La adivinanza de ${impostorPlayer.username} fue incorrecta. Pierde una vida. La palabra era: ${correctWord}. Vidas restantes: ${impostorPlayer.lives}.`;

                if (impostorPlayer.lives <= 0) {
                    impostorPlayer.isAlive = false;
                    outcomeMessage += ` El Impostor (${impostorPlayer.username}) ha sido eliminado.`;
                }

                const remainingAlivePlayers = room.players.filter(p => p.isAlive).length;

                if (remainingAlivePlayers === 1) {
                    const winnerPlayer = room.players.find(p => p.isAlive);
                    const winnerRole = winnerPlayer.isImpostor ? 'Impostor' : 'Innocents';

                    room.status = 'FINISHED';
                    outcomeMessage += ` ¡Solo queda ${winnerPlayer.username}! El juego termina. Ganan ${winnerPlayer.username}.`;
                    await room.save();

                    io.to(roomCode).emit('game_finished', {
                        winner: winnerRole,
                        message: outcomeMessage,
                        finalRoomState: getSafeRoomData(room)
                    });

                } else if (remainingAlivePlayers <= 0) {
                    room.status = 'FINISHED';
                    outcomeMessage += ` El juego termina en empate.`;
                    await room.save();

                    io.to(roomCode).emit('game_finished', {
                        winner: 'Tie',
                        message: outcomeMessage,
                        finalRoomState: getSafeRoomData(room)
                    });
                } else {
                    await resetAndEmitRoundLocal(room, outcomeMessage);
                }
            }
            safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });
        });
    });
};