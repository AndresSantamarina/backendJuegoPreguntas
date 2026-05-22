import { getSafeRoomData } from './gameLogic.js';
import { withRoomContext } from '../utils/socketHelpers.js';

export const registerGuessHandlers = (socket, io, userId, userName) => {
    socket.on('submitGuess', (data, callback) => {
        const { roomId, guessedWord: rawGuessedWord } = data;
        const guessedWord = rawGuessedWord.toUpperCase().trim();

        withRoomContext(roomId, userId, callback, async (room, player, safeCallback, roomCode) => {
            if (room.status !== 'GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });
            if (player.guessGiven) return safeCallback({ success: false, message: "Ya has intentado adivinar." });

            const currentTurnPlayerId = room.turnOrder[room.currentTurnIndex];

            if (!currentTurnPlayerId) {
                return safeCallback({ success: false, message: "Error interno: El turno del juego es inválido." });
            }

            if (currentTurnPlayerId.toString() !== userId.toString()) {
                return safeCallback({ success: false, message: "Espera tu turno para adivinar." });
            }

            const normalizedGrid = room.words.map(word => word.toUpperCase());
            if (!normalizedGrid.includes(guessedWord)) return safeCallback({ success: false, message: "La palabra no está en la lista." });

            player.guessGiven = true;
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;

            const isCorrect = guessedWord === room.secretWord.toUpperCase();

            if (!isCorrect) {
                if (!room.wrongGuesses) room.wrongGuesses = [];
                if (!room.wrongGuesses.includes(guessedWord)) {
                    room.wrongGuesses.push(guessedWord);
                }
                room.markModified('wrongGuesses');
            }

            const allGuessed = room.players.filter(p => p.isAlive).every(p => p.guessGiven);

            let outcomeMessage = `${player.username} adivinó: ${guessedWord}.`;

            if (isCorrect) {
                room.status = 'FINISHED';
                const winnerRole = player.isImpostor ? 'Impostor' : 'Innocents';
                outcomeMessage = `¡${player.username} ha adivinado la palabra clave: ${room.secretWord}! ${player.username} gana.`;

                await room.save();
                io.to(roomCode).emit('game_finished', {
                    winner: winnerRole,
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (allGuessed) {
                room.players.filter(p => p.isAlive).forEach(p => p.guessGiven = false);
                room.currentTurnIndex = 0;
                outcomeMessage = `Ambos fallaron. Se reinicia el turno de adivinanza.`;

                await room.save();
                const nextTurnUsername = room.players.find(p => p.userId.toString() === room.turnOrder[room.currentTurnIndex].toString()).username;

                io.to(roomCode).emit('guess_submitted', {
                    ...getSafeRoomData(room),
                    message: outcomeMessage + ` Ahora es turno de ${nextTurnUsername}.`
                });
            } else {
                await room.save();
                const nextPlayer = room.players.find(p => p.userId.toString() === room.turnOrder[room.currentTurnIndex].toString()).username;
                outcomeMessage = `${player.username} falló. Es turno de ${nextPlayer}.`;

                io.to(roomCode).emit('guess_submitted', {
                    ...getSafeRoomData(room),
                    message: outcomeMessage
                });
            }
            safeCallback({ success: true, message: outcomeMessage, isCorrect: isCorrect, isFinished: room.status === 'FINISHED' });
        });
    });
}