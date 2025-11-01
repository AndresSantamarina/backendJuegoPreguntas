import Room from "../database/model/Room.js";
import { getSafeRoomData, handleTwoPlayersGame,resetRoundState } from './gameLogic.js'

export const registerVotingHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('submitVote', async (data, callback) => {
        let roundWasReset = false; // 🛑 Bandera de sincronización

        // Función auxiliar para forzar la limpieza de votos y la transición a IMPOSTOR_CHOOSING
        const resetVotesAndStartImpostorChoosing = (room, roomCode, message) => {
            // 🛑 CLAVE DE LA CORRECCIÓN: Limpiar votos de los jugadores y la sala.
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
            // Asume que resetRoundState ya hace p.vote = null y room.votes = []
            console.log('Reiniciando ronda (resetRoundState). Status: IN_GAME.');
            const isTwoPlayerMode = await resetRoundState(room);
            roundWasReset = true; // 🛑 Marcamos que el documento Mongoose fue modificado externamente

            // Nota: Si 'room' es un objeto Mongoose, puede que necesites hacer un 'room = await Room.findOne(...)'
            // aquí si resetRoundState no actualiza 'room' por referencia. Lo manejamos al final por simplicidad.

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

            // Nota: 'voter' es una referencia directa a un objeto dentro de la colección 'room.players'.
            const voter = room.players.find(p => p.userId.toString() === userId.toString());
            const target = room.players.find(p => p.userId.toString() === targetId.toString());

            if (!voter || !target) return safeCallback({ success: false, message: "Jugador o objetivo no válido." });
            if (!voter.isAlive || !target.isAlive) return safeCallback({ success: false, message: "Solo jugadores vivos pueden votar o ser votados." });
            if (voter.vote) return safeCallback({ success: false, message: "Ya has votado en esta ronda." });

            // Registrar el voto
            voter.vote = targetId;
            room.votes.push({ voterId: userId, targetId });
            console.log('Jugador', voter.username, 'votó por', target.username);


            const alivePlayers = room.players.filter(p => p.isAlive);
            const votesSubmitted = alivePlayers.filter(p => p.vote !== null).length;

            // Guardamos el voto inmediatamente
            await room.save();
            console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));

            let outcomeMessage = "Voto registrado. Esperando a los demás jugadores...";

            if (votesSubmitted === alivePlayers.length) {
                // --- CÁLCULO DE VOTOS ---
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

                // -----------------------------------------------------------
                // 1. CASO: EMPATE o NADIE FUE VOTADO (Impulsa el ataque del Impostor)
                // -----------------------------------------------------------
                if (tie) {
                    if (impostorPlayer && impostorPlayer.isAlive) {
                        outcomeMessage = "¡Empate en la votación! El Impostor debe elegir una víctima.";
                        resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
                        roundWasReset = true;
                    } else {
                        await resetAndEmitRound(room, roomCode, "Empate. La ronda se reinicia.");
                    }

                    // -----------------------------------------------------------
                    // 2. CASO: UN ÚNICO JUGADOR MÁS VOTADO
                    // -----------------------------------------------------------
                } else if (mostVotedPlayer) {

                    if (mostVotedPlayer.isImpostor) {
                        mostVotedPlayer.lives -= 1;
                        outcomeMessage = `¡Encontrado! El impostor (${mostVotedPlayer.username}) pierde una vida. Vidas restantes: ${mostVotedPlayer.lives}.`;

                        if (mostVotedPlayer.lives <= 0) {
                            mostVotedPlayer.isAlive = false;
                            room.status = 'FINISHED';
                            outcomeMessage += " Los **Inocentes** ganan.";

                            io.to(roomCode).emit('game_finished', {
                                winner: 'Innocents',
                                message: outcomeMessage,
                                finalRoomState: getSafeRoomData(room)
                            });
                        } else {
                            // 🛑 CASO CLAVE: Impostor pierde vida pero sigue vivo.
                            await resetAndEmitRound(room, roomCode, outcomeMessage);
                        }

                    } else {
                        // Voto fallido a Inocente
                        outcomeMessage = `¡Voto fallido! ${mostVotedPlayer.username} es Inocente. El Impostor debe elegir una víctima.`;
                        resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
                        roundWasReset = true;
                    }
                } else {
                    await resetAndEmitRound(room, roomCode, "Error de lógica de votación. Reiniciando ronda.");
                }

                // --- Lógica de 2 jugadores (Post-evaluación del voto) ---
                const currentAliveCount = room.players.filter(p => p.isAlive).length;

                if (room.status !== 'FINISHED' && room.status !== 'IMPOSTOR_CHOOSING' && room.status !== 'IN_GAME') {
                    if (currentAliveCount === 2) {
                        await handleTwoPlayersGame(room);
                        outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
                    }
                }

                // 🛑 Guardamos el estado final después de todos los cambios de fase/ronda.
                await room.save();
                console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));
            }

            // 🛑 LÓGICA DE SINCRONIZACIÓN DE ESTADO PARA EL CALLBACK
            if (roundWasReset || room.status !== 'VOTING') {
                // Re-cargamos el documento para obtener el estado más fresco, crucial para el 'voter.vote'
                // que fue limpiado en resetRoundState.
                room = await Room.findOne({ roomId: roomCode });

                // Re-asignamos 'voter' para apuntar al objeto actualizado.
                const updatedVoter = room.players.find(p => p.userId.toString() === userId.toString());

                safeCallback({
                    success: true,
                    message: outcomeMessage,
                    currentStatus: room.status,
                    // Usamos el estado 'vote' del documento re-cargado.
                    voterVote: updatedVoter ? updatedVoter.vote : null
                });
            } else {
                // Comportamiento normal (voto registrado, esperando más votos)
                safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status, voterVote: voter.vote });
            }


        } catch (error) {
            console.error("Error al votar (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al procesar el voto." });
        }
    });
}