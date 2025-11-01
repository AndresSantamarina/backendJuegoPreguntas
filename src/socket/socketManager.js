// import Room from '../database/model/Room.js';
// import { io } from '../../index.js';

// // Mapa temporal para rastrear a qué sala está unido un socket (solo si el cliente no lo envía al desconectar)
// const socketRoomMap = new Map();

// export const initSocketIO = (io) => {
//     io.on('connection', (socket) => {

//         // console.log(`[Socket.IO]: Usuario conectado: ${socket.id}`);

//         // Evento: El cliente se une a una Sala de Socket.IO
//         socket.on('join_room', async ({ roomId, userId }) => {
//             const roomCode = roomId.toUpperCase();

//             // 1. Unir el socket al "room" de Socket.IO
//             socket.join(roomCode);
//             socketRoomMap.set(socket.id, { roomCode, userId }); // Mapear el socket a la sala y el usuario

//             console.log(`[Socket.IO]: ${userId} se unió al room: ${roomCode}`);

//             // 2. Notificar a otros jugadores (LOBBY UPDATE)
//             // try {
//             //     const room = await Room.findOne({ roomId: roomCode }, 'players status');
//             //     if (room && room.status === 'LOBBY') {
//             //         const playerNames = room.players.map(p => p.username);

//             //         io.to(roomCode).emit('player_joined', {
//             //             players: playerNames,
//             //             status: room.status,
//             //             message: `Un nuevo jugador se ha unido. Total: ${room.players.length}/4`
//             //         });
//             //     }
//             // } catch (error) {
//             //     console.error("Error al emitir join_room:", error);
//             // }
//         });

//         // Evento: Desconexión del socket
//         socket.on('disconnect', async () => {
//             const socketData = socketRoomMap.get(socket.id);

//             if (socketData) {
//                 const { roomCode, userId } = socketData;
//                 socketRoomMap.delete(socket.id); // Limpiar el mapa

//                 console.log(`[Socket.IO]: Usuario ${userId} desconectado del room: ${roomCode}`);

//                 try {
//                     const room = await Room.findOne({ roomId: roomCode });

//                     if (room) {
//                         const playerIndex = room.players.findIndex(p => p.userId.toString() === userId.toString());
//                         if (playerIndex !== -1) {
//                             const disconnectedPlayer = room.players[playerIndex];

//                             if (room.status === 'LOBBY') {
//                                 // Opción 1: Si es LOBBY, remover al jugador.
//                                 room.players.splice(playerIndex, 1);
//                                 await room.save();

//                                 // Emitir actualización a la sala
//                                 io.to(roomCode).emit('player_left', {
//                                     players: room.players.map(p => p.username),
//                                     message: `${disconnectedPlayer.username} ha abandonado la sala.`,
//                                     isHost: disconnectedPlayer.userId.toString() === room.hostId.toString()
//                                 });

//                                 // Si era el host, debes asignar un nuevo host
//                                 if (disconnectedPlayer.userId.toString() === room.hostId.toString() && room.players.length > 0) {
//                                     room.hostId = room.players[0].userId;
//                                     await room.save();
//                                     io.to(roomCode).emit('host_changed', { newHostId: room.hostId, newHostName: room.players[0].username });
//                                 }

//                             } else if (room.status !== 'FINISHED') {
//                                 // Opción 2: Si el juego está en curso, marcarlo como desconectado/inactivo
//                                 // En este juego simple, podríamos considerarlo como "eliminado"
//                                 disconnectedPlayer.isAlive = false;
//                                 disconnectedPlayer.lives = 0;
//                                 await room.save();

//                                 io.to(roomCode).emit('player_status_changed', {
//                                     message: `${disconnectedPlayer.username} se ha desconectado.`,
//                                     roomState: room.status // Se enviaría el estado actualizado del juego.
//                                 });
//                             }
//                         }
//                     }

//                 } catch (error) {
//                     console.error("Error al manejar la desconexión:", error);
//                 }
//             }
//         });
//     });
// };

import { registerGameHandlers } from '../controllers/index.js';

const socketRoomMap = new Map();

export const initSocketIO = (io) => {
    io.on('connection', (socket) => {
        registerGameHandlers(socket, io);
        socket.on('join_room', ({ roomId, userId }) => {
            const roomCode = roomId.toUpperCase();
            socket.join(roomCode);
            socketRoomMap.set(socket.id, { roomCode, userId });
            console.log(`[Socket.IO]: ${userId} se unió al room: ${roomCode}`);
        });
        socket.on('disconnect', async () => {
            const socketData = socketRoomMap.get(socket.id);
            if (socketData) {
                const { roomCode, userId } = socketData;
                socketRoomMap.delete(socket.id); 
            }
        });
    });
};