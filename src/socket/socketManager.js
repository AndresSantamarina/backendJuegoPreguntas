import { registerGameHandlers } from '../controllers/index.js';

const socketRoomMap = new Map();

export const initSocketIO = (io) => {
    io.on('connection', (socket) => {
        registerGameHandlers(socket, io);
        socket.on('join_room', ({ roomId, userId }) => {
            const roomCode = roomId.toUpperCase();
            socket.join(roomCode);
            socketRoomMap.set(socket.id, { roomCode, userId });
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