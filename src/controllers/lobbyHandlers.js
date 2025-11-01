import Room from "../database/model/Room.js";
import Category from "../database/model/Category.js"
import {generateRoomId, getSafeRoomData, shuffleArray, setNextTurn } from './gameLogic.js'

export const registerLobbyHandlers = (socket, io, userId, userName) => {
    const createSafeCallback = (callback) => (response) => {
        if (typeof callback === 'function') {
            callback(response);
        }
    };
    socket.on('createRoom', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { categoryName } = data;

        try {
            const allCategories = await Category.find({});
            if (allCategories.length === 0) {
                return safeCallback({ success: false, message: "No hay categorías disponibles en la base de datos." });
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
                    return safeCallback({ success: false, message: `Categoría "${categoryName}" no válida.` });
                }
                selectedCategory = foundCategory;
            }

            if (!selectedCategory || selectedCategory.words.length < 2) {
                return safeCallback({ success: false, message: "La categoría seleccionada no tiene palabras suficientes." });
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
            safeCallback({
                success: true,
                roomId: roomId,
                room: getSafeRoomData(newRoom),
                message: `Sala creada con éxito. Categoría: ${selectedCategory.name}.`
            });

        } catch (error) {
            console.error("Error al crear sala (Socket):", error);
            safeCallback({ success: false, message: "Error interno al crear la sala." });
        }
    });

    socket.on('joinRoom', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            let room = await Room.findOne({ roomId: roomCode });

            if (!room) { safeCallback({ success: false, message: "Sala no encontrada." }); return }
            if (room.status !== 'LOBBY') return safeCallback({ success: false, message: "La partida ya ha comenzado." });
            const isPlayerInRoom = room.players.some(p => p.userId.toString() === userId.toString());

            if (isPlayerInRoom) {
                socket.join(roomCode);
                return safeCallback({ success: true, roomId: roomCode, room: getSafeRoomData(room), message: "Ya estás en esta sala." });
            }

            if (room.players.length >= room.maxPlayers) {
                return safeCallback({ success: false, message: "La sala está llena (4/4)." });
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
            console.log('Jugadores ANTES de guardar:', room.players.map(p => p.username));
            await room.save();

            room = await Room.findOne({ roomId: roomCode });
            console.log('Jugadores DESPUÉS de recargar (FRESH):', room.players.map(p => p.username));

            socket.join(roomCode);
            console.log('Emitiendo a sala', roomCode, 'con', room.players.length, 'jugadores.');
            io.to(roomCode).emit(`player_update_${roomCode}`, {
                ...getSafeRoomData(room), // Enviamos toda la data de la sala (incluyendo la lista de players)
                message: `${userName} se ha unido al lobby.` // Opcional, pero útil
            });

            safeCallback({

                success: true,
                roomId: roomCode,
                room: getSafeRoomData(room),
                message: `Te has unido a la sala ${roomCode}.`

            });
            console.log('Callback a', userName, 'con estado de sala:', getSafeRoomData(room).players.map(p => p.username));

        } catch (error) {
            console.error("Error al unirse a sala (Socket):", error);
            safeCallback({ success: false, message: "Error interno al unirse a la sala." });
        }
    })

    socket.on('getGameState', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId, userId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId', 'words');

            if (!room) { safeCallback({ success: false, message: 'Sala no encontrada.' }); return }

            const player = room.players.find(p => p.userId.toString() === userId.toString());
            if (!player) return safeCallback({ success: false, message: 'No eres jugador de esta sala.' });

            socket.join(roomCode);

            const myRole = player.isImpostor ? 'IMPOSTOR' : 'INNOCENT';
            const myKeyword = player.isImpostor ? room.categoryId.words.find(w => w !== room.secretWord) : room.secretWord;

            safeCallback({
                success: true,
                room: {
                    ...getSafeRoomData(room),
                    words: room.categoryId.words,
                },
                myRole: myRole,
                myKeyword: myKeyword,
                message: 'Estado de juego cargado.'
            });

        } catch (error) {
            console.error("Error al obtener estado (Socket):", error);
            safeCallback({ success: false, message: 'Error al obtener estado de la sala.' });
        }
    });


    // --- 3. INICIAR PARTIDA ---
    socket.on('startGame', async (data, callback) => {
        const safeCallback = createSafeCallback(callback);
        const { roomId } = data;
        const roomCode = roomId.toUpperCase();
        // console.log(`[DEBUG START] Inicia el manejo de startGame para sala: ${roomCode}`);
        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');
            if (!room) { safeCallback({ success: false, message: "Sala no encontrada." }); return }
            if (room.hostId.toString() !== userId.toString()) {
                safeCallback({ success: false, message: "Solo el anfitrión puede iniciar la partida." });
                return;
            }
            if (room.players.length !== room.maxPlayers) return safeCallback({ success: false, message: `Se necesitan ${room.maxPlayers} jugadores para empezar.` });
            if (room.status !== 'LOBBY') return safeCallback({ success: false, message: "La partida ya ha comenzado." });
            console.log(`[START GAME] Validación OK. Iniciando lógica del juego.`);
            const players = room.players;
            const totalPlayers = players.length;
            const impostorIndex = Math.floor(Math.random() * totalPlayers);
            const impostorId = players[impostorIndex].userId;
            const allWords = room.categoryId.words;
            const secretWordIndex = Math.floor(Math.random() * allWords.length);
            const secretWord = allWords[secretWordIndex];

            room.status = 'IN_GAME';
            room.impostorId = impostorId;
            room.secretWord = secretWord;
            room.currentRound = 1;

            const alivePlayerIds = players.map(p => p.userId.toString());
            room.turnOrder = shuffleArray(alivePlayerIds);
            room.currentTurnIndex = -1;
            room.turnStartTime = new Date();

            room.players = players.map(player => ({
                ...player.toObject(),
                isImpostor: player.userId.toString() === impostorId.toString(),
                clueGiven: null,
                vote: null,
                guessGiven: false,
            }));

            await room.save();

            safeCallback({
                success: true,
                message: "Partida iniciada. ¡Que comience la ronda 1!",
            });

            await setNextTurn(room);
        } catch (error) {
            console.error("Error al iniciar la partida (Socket):", error);
            safeCallback({ success: false, message: "Error interno del servidor al iniciar la partida." });
        }
    });
}