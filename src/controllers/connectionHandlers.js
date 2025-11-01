import Room from "../database/model/Room.js";
import {getSafeRoomData, setNextTurn, handleTwoPlayersGame } from './gameLogic.js'

export const registerConnectionHandlers = (socket, io, userId, userName) => {
    socket.on('disconnect', async () => {
        // console.log(`Socket Desconectado: ${socket.id} (User: ${userName})`);
        try {
            const room = await Room.findOne({ "players.userId": userId, status: { $in: ['LOBBY', 'IN_GAME'] } });

            if (room) {
                const player = room.players.find(p => p.userId.toString() === userId.toString());

                if (room.status === 'LOBBY') {
                    room.players = room.players.filter(p => p.userId.toString() !== userId.toString());
                    await room.save();

                    io.to(room.roomId).emit(`player_update_${room.roomId}`, {
                        players: getSafeRoomData(room).players
                    });

                    // console.log(`Jugador ${userName} eliminado del lobby ${room.roomId}.`);

                } else if (room.status === 'IN_GAME') {
                    player.isAlive = false;
                    player.lives = 0;
                    await room.save();

                    io.to(room.roomId).emit('game_status_update', {
                        ...getSafeRoomData(room),
                        message: `⚠️ ¡El jugador ${userName} se ha desconectado y ha sido eliminado de la partida!`
                    });

                    // 1. Comprobar si termina la partida por desconexión
                    const aliveInnocents = room.players.filter(p => p.isAlive && !p.isImpostor).length;
                    if (aliveInnocents === 0 && room.impostorId) {
                        room.status = 'FINISHED';
                        await room.save();
                        io.to(room.roomId).emit('game_finished', {
                            winner: 'Impostor',
                            message: `¡El impostor gana la partida! El último inocente se desconectó.`,
                            finalRoomState: getSafeRoomData(room)
                        });
                        clearRoomTimer(room.roomId);
                    }
                    if (room.status === 'IN_GAME' && room.turnOrder[room.currentTurnIndex]?.toString() === userId.toString()) {
                        await setNextTurn(room);
                    }
                    const currentAlivePlayers = room.players.filter(p => p.isAlive).length;
                    if (currentAlivePlayers === 2 && room.status !== 'FINISHED') {
                        await handleTwoPlayersGame(room);
                    }
                }
            }
        } catch (error) {
            console.error("Error al manejar la desconexión:", error);
        }
    });
}