import Room from "../database/model/Room.js";
import { getSafeRoomData } from './gameLogic.js'

export const registerGuessHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('submitGuess', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId, guessedWord: rawGuessedWord } = data;
        const roomCode = roomId.toUpperCase();

        const guessedWord = rawGuessedWord.toUpperCase().trim();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
            if (room.status !== 'GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });

            const player = room.players.find(p => p.userId.toString() === userId.toString());
            if (!player || player.guessGiven) return safeCallback({ success: false, message: "Ya has intentado adivinar o no eres un jugador." });

            // 🛑 NUEVA LÓGICA DE TURNO
            const currentTurnPlayerId = room.turnOrder[room.currentTurnIndex];

            // ✅ CORRECCIÓN: Validar que el ID existe antes de usar .toString()asd
            if (!currentTurnPlayerId) {
                console.error(`Error: Turno ${room.currentTurnIndex} es inválido para turnOrder de tamaño ${room.turnOrder.length}`);
                return safeCallback({ success: false, message: "Error interno: El turno del juego es inválido." });
            }

            if (currentTurnPlayerId.toString() !== userId.toString()) {
                return safeCallback({ success: false, message: "Espera tu turno para adivinar." });
            }
            // ---------------------

            const wordGrid = room.categoryId.words;
            const normalizedGrid = wordGrid.map(word => word.toUpperCase());
            if (!normalizedGrid.includes(guessedWord)) return safeCallback({ success: false, message: "La palabra no está en la lista." });

            player.guessGiven = true;
            // 🛑 Avanzar el turno
            room.currentTurnIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
            // ---------------------
            await room.save();

            const isCorrect = guessedWord === room.secretWord;
            const otherPlayer = room.players.find(p => p.userId.toString() !== userId.toString() && p.isAlive);
            const allGuessed = room.players.filter(p => p.isAlive).every(p => p.guessGiven);

            let outcomeMessage = `${player.username} adivinó: ${guessedWord}.`;

            if (isCorrect) {
                room.status = 'FINISHED';
                // El jugador que adivinó es el ganador del round, definimos el bando
                const winnerRole = player.isImpostor ? 'Impostor' : 'Innocents';
                outcomeMessage = `¡${player.username} ha adivinado la palabra clave: ${room.secretWord}! El bando **${winnerRole}** gana.`;

                io.to(roomCode).emit('game_finished', {
                    winner: winnerRole,
                    message: outcomeMessage,
                    finalRoomState: getSafeRoomData(room)
                });
            } else if (allGuessed) {
                // Ambos jugadores han intentado adivinar y han fallado.
                room.players.filter(p => p.isAlive).forEach(p => {
                    p.guessGiven = false;
                });

                // ✅ CORRECCIÓN: Resetear el índice de turno a 0 para la nueva sub-ronda
                room.currentTurnIndex = 0;

                outcomeMessage = `Ambos fallaron. Se reinicia el turno de adivinanza.`;
                await room.save();
                const nextTurnUsername = room.players.find(p => p.userId.toString() === room.turnOrder[room.currentTurnIndex].toString()).username;
                const safeRoomData = getSafeRoomData(room);
                // 🛑 LOG DE VERIFICACIÓN DEL BACKEND
                console.log("[BACKEND LOG] Datos de jugadores al reiniciar turno:", safeRoomData.players.map(p => ({ userId: p.userId, guessGiven: p.guessGiven })));

                io.to(roomCode).emit('guess_submitted', {
                    ...safeRoomData, // ✅ Usa la variable ya serializada
                    message: outcomeMessage + ` Ahora es turno de **${nextTurnUsername}**.`
                });

            } else {
                // El primer jugador falló, turno del segundo jugador
                const nextPlayer = room.players.find(p => p.userId.toString() === room.turnOrder[room.currentTurnIndex].toString()).username;

                outcomeMessage = `${player.username} falló. Es turno de **${nextPlayer}**.`;
                io.to(roomCode).emit('guess_submitted', {
                    ...getSafeRoomData(room),
                    message: outcomeMessage
                });
            }



            safeCallback({ success: true, message: outcomeMessage, isCorrect: isCorrect, isFinished: room.status === 'FINISHED' });

        } catch (error) {
            console.error("Error al enviar adivinanza (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al enviar la adivinanza." });
        }
    });


}