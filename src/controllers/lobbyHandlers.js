import Room from "../database/model/Room.js";
import Category from "../database/model/Category.js"
import { generateRoomId, getSafeRoomData, shuffleArray, setNextTurn } from './gameLogic.js'

export const registerLobbyHandlers = (socket, io, userId, userName) => {
    const createSafeResponse = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };

    socket.on('createRoom', async (data, callback) => {
        const res = createSafeResponse(callback);
        const { categoryName } = data;

        try {
            const allCategories = await Category.find({});
            if (allCategories.length === 0) {
                return res({ success: false, message: "No hay categorías disponibles en la base de datos." });
            }

            let selectedCategory = null;

            if (!categoryName || categoryName.toLowerCase() === 'random') {
                const randomIndex = Math.floor(Math.random() * allCategories.length);
                selectedCategory = allCategories[randomIndex];
            } else {
                const foundCategory = allCategories.find(
                    c => c.name.toUpperCase() === categoryName.toUpperCase()
                );
                if (!foundCategory) {
                    return res({ success: false, message: `Categoría "${categoryName}" no válida.` });
                }
                selectedCategory = foundCategory;
            }

            if (!selectedCategory || selectedCategory.words.length < 2) {
                return res({ success: false, message: "La categoría seleccionada no tiene palabras suficientes." });
            }

            let roomId;
            let roomExists = true;
            while (roomExists) {
                roomId = generateRoomId();
                roomExists = await Room.findOne({ roomId });
            }

            const hostPlayer = {
                userId: userId,
                username: userName,
                lives: 3,
                isImpostor: false,
                isAlive: true,
                clueGiven: null,
                vote: null,
            };

            const newRoom = new Room({
                roomId,
                hostId: userId,
                players: [hostPlayer],
                categoryId: selectedCategory._id,
                status: 'LOBBY',
            });

            await newRoom.save();

            socket.join(roomId);
            res({
                success: true,
                roomId: roomId,
                room: getSafeRoomData(newRoom),
                message: `Sala creada con éxito. Categoría: ${selectedCategory.name}.`
            });

        } catch (error) {
            console.error("Error al crear sala (Socket):", error);
            res({ success: false, message: "Error interno al crear la sala." });
        }
    });

    socket.on('joinRoom', async (data, callback) => {
        const res = createSafeResponse(callback);
        const { roomId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            let room = await Room.findOne({ roomId: roomCode });

            if (!room) { res({ success: false, message: "Sala no encontrada." }); return }
            if (room.status !== 'LOBBY') return res({ success: false, message: "La partida ya ha comenzado." });
            const isPlayerInRoom = room.players.some(p => p.userId.toString() === userId.toString());

            if (isPlayerInRoom) {
                socket.join(roomCode);
                return res({ success: true, roomId: roomCode, room: getSafeRoomData(room), message: "Ya estás en esta sala." });
            }

            if (room.players.length >= room.maxPlayers) {
                return res({ success: false, message: `La sala está llena (${room.maxPlayers}/${room.maxPlayers}).` });
            }

            const newPlayer = {
                userId: userId,
                username: userName,
                lives: 3,
                isImpostor: false,
                isAlive: true,
                clueGiven: null,
                vote: null,
            };

            room.players.push(newPlayer);
            await room.save();

            room = await Room.findOne({ roomId: roomCode });

            socket.join(roomCode);
            io.to(roomCode).emit(`player_update`, {
                ...getSafeRoomData(room),
                message: `${userName} se ha unido al lobby.`
            });

            res({
                success: true,
                roomId: roomCode,
                room: getSafeRoomData(room),
                message: `Te has unido a la sala ${roomCode}.`
            });
        } catch (error) {
            console.error("Error al unirse a sala (Socket):", error);
            res({ success: false, message: "Error interno al unirse a la sala." });
        }
    })

    socket.on('getGameState', async (data, callback) => {
        const res = createSafeResponse(callback);
        const { roomId, userId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) { res({ success: false, message: 'Sala no encontrada.' }); return }

            const player = room.players.find(p => p.userId.toString() === userId.toString());
            if (!player) return res({ success: false, message: 'No eres jugador de esta sala.' });

            socket.join(roomCode);

            let myKeyword = null;
            if (room.status === 'IN_GAME') {
                if (player.isImpostor) {
                    myKeyword = null
                } else {
                    myKeyword = room.secretWord;
                }
            }

            const myRole = player.isImpostor ? 'IMPOSTOR' : 'INNOCENT';
            const allCategoryWords = room.categoryId.words;

            res({
                success: true,
                room: {
                    ...getSafeRoomData(room),
                    words: allCategoryWords
                },
                myRole: myRole,
                myKeyword: myKeyword,
                message: 'Estado de juego cargado.'
            });

        } catch (error) {
            console.error("Error al obtener estado (Socket):", error);
            res({ success: false, message: 'Error al obtener estado de la sala.' });
        }
    });

    socket.on('startGame', async (data, callback) => {
        const res = createSafeResponse(callback);
        const { roomId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) { res({ success: false, message: "Sala no encontrada." }); return }
            if (room.hostId.toString() !== userId.toString()) {
                res({ success: false, message: "Solo el anfitrión puede iniciar la partida." });
                return;
            }
            const MIN_PLAYERS = 3;
            if (room.players.length < MIN_PLAYERS) {
                return res({ success: false, message: `Se necesita un mínimo de ${MIN_PLAYERS} jugadores para empezar.` })
            };
            if (room.status !== 'LOBBY') return res({ success: false, message: "La partida ya ha comenzado." });

            const players = room.players;
            const totalPlayers = players.length;
            const impostorIndex = Math.floor(Math.random() * totalPlayers);
            const impostorIdString = players[impostorIndex].userId.toString();
            const allWords = room.categoryId.words;
            const secretWordIndex = Math.floor(Math.random() * allWords.length);
            const secretWord = allWords[secretWordIndex];

            room.status = 'IN_GAME';
            room.impostorId = impostorIdString;
            room.secretWord = secretWord;
            room.words = allWords;
            room.currentRound = 1;
            room.status = 'IN_GAME';
            room.turnOrder = shuffleArray(room.players.map(p => p.userId.toString())); room.currentTurnIndex = -1;
            room.turnStartTime = new Date();
            room.players = players.map(player => {
                const playerUserIdString = player.userId.toString();
                return ({
                    ...player.toObject(),
                    isImpostor: playerUserIdString === impostorIdString,
                    clueGiven: null,
                    vote: null,
                    guessGiven: false,
                });
            });

            await room.save();

            res({
                success: true,
                message: "Partida iniciada. ¡Que comience la ronda 1!",
            });

            await setNextTurn(room);
            io.to(roomCode).emit('game_started_update');
        } catch (error) {
            console.error("Error al iniciar la partida (Socket):", error);
            res({ success: false, message: "Error interno del servidor al iniciar la partida." });
        }
    });
    socket.on('cancelGame', async (data, callback) => {
        const { roomId, userId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode });

            if (!room) {
                return callback({ success: false, message: "Sala no encontrada." });
            }

            if (room.hostId.toString() !== userId.toString()) {
                return callback({ success: false, message: "Solo el anfitrión puede cancelar la sala." });
            }

            io.to(roomCode).emit('room_closed', {
                message: `${room.players.find(p => p.userId === userId)?.username || "El anfitrión"} ha cancelado la partida.`
            });

            await Room.deleteOne({ roomId: roomCode });

            callback({ success: true, message: "Sala cancelada exitosamente." });

        } catch (error) {
            console.error("Error al cancelar la sala:", error);
            callback({ success: false, message: "Error interno del servidor al cancelar la sala." });
        }
    });
}