import { getSafeRoomData, handleTwoPlayersGame, resetRoundState } from './gameLogic.js';
import { withRoomContext } from '../utils/socketHelpers.js';

export const registerVotingHandlers = (socket, io, userId, userName) => {

    socket.on('submitVote', (data, callback) => {
        const { roomId, targetId } = data;

        withRoomContext(roomId, userId, callback, async (room, voter, safeCallback, roomCode) => {
            if (room.status !== 'VOTING') return safeCallback({ success: false, message: "No es el momento de votar." });

            const target = room.players.find(p => p.userId.toString() === targetId.toString());
            if (!target) return safeCallback({ success: false, message: "Objetivo no válido." });
            if (!voter.isAlive || !target.isAlive) return safeCallback({ success: false, message: "Solo jugadores vivos pueden votar o ser votados." });
            if (voter.vote) return safeCallback({ success: false, message: "Ya has votado en esta ronda." });

            voter.vote = targetId;
            room.votes.push({ voterId: userId, targetId });

            const alivePlayers = room.players.filter(p => p.isAlive);
            const votesSubmitted = alivePlayers.filter(p => p.vote !== null).length;

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
                const mostVotedPlayer = !tie ? room.players.find(p => p.userId.toString() === mostVotedIds[0].toString()) : null;

                if (tie) {
                    if (impostorPlayer && impostorPlayer.isAlive) {
                        outcomeMessage = "¡Empate en la votación! El Impostor debe elegir una víctima.";
                        room.players.forEach(p => { p.vote = null; });
                        room.votes = [];
                        room.status = 'IMPOSTOR_CHOOSING';
                        await room.save();

                        io.to(roomCode).emit('impostor_choosing', {
                            ...getSafeRoomData(room),
                            message: outcomeMessage
                        });
                    } else {
                        const isTwoPlayerMode = await resetRoundState(room);
                        if (!isTwoPlayerMode) {
                            io.to(roomCode).emit('round_new', {
                                ...getSafeRoomData(room),
                                message: "Empate. La ronda se reinicia. La ronda " + room.currentRound + " comienza."
                            });
                        }
                    }
                } else if (mostVotedPlayer) {
                    if (mostVotedPlayer.isImpostor) {
                        outcomeMessage = `¡Encontrado! El impostor (${mostVotedPlayer.username}) ha sido descubierto. ¡Tiene una oportunidad para adivinar la palabra clave!`;
                        room.status = 'IMPOSTOR_GUESSING';
                        room.players.forEach(p => { p.vote = null; });
                        room.votes = [];
                        await room.save();

                        io.to(roomCode).emit('guessing_impostor_started', {
                            words: room.words,
                            message: outcomeMessage,
                            status: 'IMPOSTOR_GUESSING'
                        });
                    } else {
                        outcomeMessage = `¡Voto fallido! ${mostVotedPlayer.username} es Inocente. El Impostor debe elegir una víctima.`;
                        room.players.forEach(p => { p.vote = null; });
                        room.votes = [];
                        room.status = 'IMPOSTOR_CHOOSING';
                        await room.save();

                        io.to(roomCode).emit('impostor_choosing', {
                            ...getSafeRoomData(room),
                            message: outcomeMessage
                        });
                    }
                }

                const currentAliveCount = room.players.filter(p => p.isAlive).length;
                if (room.status !== 'FINISHED' && room.status !== 'IMPOSTOR_CHOOSING' && room.status !== 'IN_GAME') {
                    if (currentAliveCount === 2) {
                        await handleTwoPlayersGame(room);
                        outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
                    }
                }
            } else {
                await room.save();
            }

            if (room.status !== 'VOTING') {
                safeCallback({ success: true, message: outcomeMessage });
            } else {
                safeCallback({ success: true, message: outcomeMessage, room: getSafeRoomData(room) });
            }
        });
    });
};