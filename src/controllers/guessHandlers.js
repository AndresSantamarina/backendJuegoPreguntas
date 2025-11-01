import Room from "../database/model/Room.js";
import {getSafeRoomData} from './gameLogic.js'

export const registerGuessHandlers = (socket, io, userId, userName) => {
     const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('submitGuess', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId, guessedWord } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
            if (room.status !== 'GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });

            const player = room.players.find(p => p.userId.toString() === userId.toString());
            if (!player || player.guessGiven) return safeCallback({ success: false, message: "Ya has intentado adivinar o no eres un jugador." });

            const wordGrid = room.categoryId.words;
            if (!wordGrid.includes(guessedWord)) return safeCallback({ success: false, message: "La palabra no está en la lista." });

            player.guessGiven = true;
            await room.save();

            const isCorrect = guessedWord === room.secretWord;
            const otherPlayer = room.players.find(p => p.userId.toString() !== userId.toString() && p.isAlive);
            const allGuessed = room.players.filter(p => p.isAlive).every(p => p.guessGiven);

            let outcomeMessage = `${player.username} adivinó: ${guessedWord}.`;

            if (isCorrect) {
                room.status = 'FINISHED';
                const winnerRole = player.isImpostor ? 'Impostor' : 'Innocents';
                outcomeMessage = `¡${player.username} ha adivinado la palabra clave: ${room.secretWord}! El bando **${winnerRole}** gana.`;

                io.to(roomCode).emit('game_finished', {
                    winner: winnerRole,
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (allGuessed) {
                room.players.filter(p => p.isAlive).forEach(p => {
                    p.guessGiven = false;
                });

                outcomeMessage = `Ambos jugadores fallaron. ¡Tienen otra oportunidad!`;
                io.to(roomCode).emit('guessing_next_attempt', {
                    ...getSafeRoomData(room),
                    secretWord: room.secretWord,
                    message: outcomeMessage
                });
            } else {
                outcomeMessage += " Esperando al otro jugador...";
                io.to(roomCode).emit('guess_submitted', {
                    ...getSafeRoomData(room),
                    message: outcomeMessage
                });
            }

            await room.save();

            safeCallback({ success: true, message: outcomeMessage, isCorrect: isCorrect, isFinished: room.status === 'FINISHED' });

        } catch (error) {
            console.error("Error al enviar adivinanza (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al enviar la adivinanza." });
        }
    });


}