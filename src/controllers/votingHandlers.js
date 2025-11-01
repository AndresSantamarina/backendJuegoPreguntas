import Room from "../database/model/Room.js";
import { getSafeRoomData, handleTwoPlayersGame, resetRoundState } from './gameLogic.js'

export const registerVotingHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('submitVote', async (data, callback) => {
        let roundWasReset = false;
        const resetVotesAndStartImpostorChoosing = (room, roomCode, message) => {
            console.log('Limpiando votos. Status: IMPOSTOR_CHOOSING.');
            room.players.forEach(p => { p.vote = null; });
            room.votes = [];
            room.status = 'IMPOSTOR_CHOOSING';

            io.to(roomCode).emit('impostor_choosing', {
                ...getSafeRoomData(room),
                message: message
            });
        };

        const resetAndEmitRound = async (room, roomCode, baseMessage) => {
            console.log('Reiniciando ronda (resetRoundState). Status: IN_GAME.');
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
            if (room.status !== 'VOTING') return safeCallback({ success: false, message: "No es el momento de votar." });

            const voter = room.players.find(p => p.userId.toString() === userId.toString());
            const target = room.players.find(p => p.userId.toString() === targetId.toString());

            if (!voter || !target) return safeCallback({ success: false, message: "Jugador o objetivo no válido." });
            if (!voter.isAlive || !target.isAlive) return safeCallback({ success: false, message: "Solo jugadores vivos pueden votar o ser votados." });
            if (voter.vote) return safeCallback({ success: false, message: "Ya has votado en esta ronda." });

            voter.vote = targetId;
            room.votes.push({ voterId: userId, targetId });
            console.log('Jugador', voter.username, 'votó por', target.username);


            const alivePlayers = room.players.filter(p => p.isAlive);
            const votesSubmitted = alivePlayers.filter(p => p.vote !== null).length;

            await room.save();
            console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));

            let outcomeMessage = "Voto registrado. Esperando a los demás jugadores...";

            if (votesSubmitted === alivePlayers.length) {
                const voteCounts = {};
                alivePlayers.forEach(p => {
                    if (p.vote) {
                        voteCounts[p.vote] = (voteCounts[p.vote] || 0) + 1;
                    }
                });

                let maxVotes = 0;
                let mostVotedIds = [];

                for (const playerId in voteCounts) {
                    const count = voteCounts[playerId];
                    if (count > maxVotes) {
                        maxVotes = count;
                        mostVotedIds = [playerId];
                    } else if (count === maxVotes) {
                        mostVotedIds.push(playerId);
                    }
                }

                const tie = mostVotedIds.length !== 1 || maxVotes === 0;
                const impostorPlayer = room.players.find(p => p.isImpostor === true);
                const mostVotedPlayer = !tie
                    ? room.players.find(p => p.userId.toString() === mostVotedIds[0].toString())
                    : null;

                if (tie) {
                    if (impostorPlayer && impostorPlayer.isAlive) {
                        outcomeMessage = "¡Empate en la votación! El Impostor debe elegir una víctima.";
                        resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
                        roundWasReset = true;
                    } else {
                        await resetAndEmitRound(room, roomCode, "Empate. La ronda se reinicia.");
                    }

                } else if (mostVotedPlayer) {

                    if (mostVotedPlayer.isImpostor) {
                        outcomeMessage = `¡Encontrado! El impostor (${mostVotedPlayer.username}) ha sido descubierto. ¡Tiene una oportunidad para adivinar la palabra clave!`;
                        room.status = 'IMPOSTOR_GUESSING';
                        room.players.forEach(p => { p.vote = null; });
                        room.votes = [];

                        io.to(roomCode).emit('guessing_impostor_started', {
                            ...getSafeRoomData(room),
                            message: outcomeMessage, // Pasa el mensaje al Swal
                            status: 'IMPOSTOR_GUESSING' // Asegura que el status vaya en los datos
                        });

                        roundWasReset = true;
                    }
                    else {
                        outcomeMessage = `¡Voto fallido! ${mostVotedPlayer.username} es Inocente. El Impostor debe elegir una víctima.`;
                        resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
                        roundWasReset = true;
                    }
                } else {
                    await resetAndEmitRound(room, roomCode, "Error de lógica de votación. Reiniciando ronda.");
                }

                const currentAliveCount = room.players.filter(p => p.isAlive).length;

                if (room.status !== 'FINISHED' && room.status !== 'IMPOSTOR_CHOOSING' && room.status !== 'IN_GAME') {
                    if (currentAliveCount === 2) {
                        await handleTwoPlayersGame(room);
                        outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
                    }
                }

                await room.save();
                console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));
            }

            if (room.status !== 'VOTING') {
                // Si la fase ha cambiado (IMPOSTOR_CHOOSING, IMPOSTOR_GUESSING, IN_GAME, FINISHED),
                // NO enviamos 'room' en la respuesta. El frontend debe esperar el broadcast (io.to(roomCode).emit).
                safeCallback({
                    success: true,
                    message: outcomeMessage,
                });
            } else {
                // Si la fase es AÚN 'VOTING' (votación parcial), enviamos el estado actualizado.
                safeCallback({
                    success: true,
                    message: outcomeMessage,
                    room: getSafeRoomData(room) // El frontend (useGameSocket) lo ignorará, solo actualizará 'myVoteTarget'.
                });
            }
        } catch (error) {
            console.error("Error al votar (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al procesar el voto." });
        }
    });
}