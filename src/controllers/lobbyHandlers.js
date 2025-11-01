import Room from "../database/model/Room.js";
import Category from "../database/model/Category.js"
import { generateRoomId, getSafeRoomData, shuffleArray, setNextTurn } from './gameLogic.js'

export const registerLobbyHandlers = (socket, io, userId, userName) => {

    // Función de respuesta local para garantizar que el callback de Socket.io se ejecute solo si existe.
    // Esto previene el "TypeError: callback is not a function" en el frontend.
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
                // maxPlayers se asume que se establece aquí o en el esquema (usando un valor por defecto)
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

            // Asumiendo que maxPlayers tiene un valor por defecto razonable o está definido
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
            console.log('Jugadores ANTES de guardar:', room.players.map(p => p.username));
            await room.save();

            room = await Room.findOne({ roomId: roomCode });
            console.log('Jugadores DESPUÉS de recargar (FRESH):', room.players.map(p => p.username));

            socket.join(roomCode);
            console.log('Emitiendo a sala', roomCode, 'con', room.players.length, 'jugadores.');
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
            console.log('Callback a', userName, 'con estado de sala:', getSafeRoomData(room).players.map(p => p.username));

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
            // Asegúrate de poblar categoryId para tener acceso a las palabras
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) { res({ success: false, message: 'Sala no encontrada.' }); return }

            const player = room.players.find(p => p.userId.toString() === userId.toString());
            if (!player) return res({ success: false, message: 'No eres jugador de esta sala.' });

            socket.join(roomCode);

            // 💡 Verificación de la Palabra Clave:
            let myKeyword = null;
            if (room.status === 'IN_GAME') {
                if (player.isImpostor) {
                    myKeyword = null
                } else {
                    myKeyword = room.secretWord;
                }
            }

            const myRole = player.isImpostor ? 'IMPOSTOR' : 'INNOCENT';

            console.log('--- DEBUG GET GAME STATE ---');
            console.log('ID del Jugador que pide estado:', userId.toString());
            console.log('Estado de la Sala:', room.status);
            console.log('Palabra Secreta de la Sala:', room.secretWord);
            console.log('Rol Asignado al Jugador:', myRole);
            console.log('Palabra Clave Asignada (myKeyword):', myKeyword);
            console.log('----------------------------');

            const allCategoryWords = room.categoryId.words;

            res({
                success: true,
                room: {
                    ...getSafeRoomData(room),
                    words: allCategoryWords
                    // Se asume que getSafeRoomData incluye los datos de la sala
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


    // --- 3. INICIAR PARTIDA ---
    socket.on('startGame', async (data, callback) => {
        const res = createSafeResponse(callback);
        const { roomId } = data;
        const roomCode = roomId.toUpperCase();

        try {
            const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

            if (!room) { res({ success: false, message: "Sala no encontrada." }); return }

            // Validaciones
            if (room.hostId.toString() !== userId.toString()) {
                res({ success: false, message: "Solo el anfitrión puede iniciar la partida." });
                return;
            }
            if (room.players.length !== room.maxPlayers) return res({ success: false, message: `Se necesitan ${room.maxPlayers} jugadores para empezar.` });
            if (room.status !== 'LOBBY') return res({ success: false, message: "La partida ya ha comenzado." });

            console.log(`[START GAME] Validación OK. Iniciando lógica del juego.`);

            const players = room.players;
            const totalPlayers = players.length;

            // 1. Lógica del Impostor y la Palabra Secreta
            const impostorIndex = Math.floor(Math.random() * totalPlayers);
            // ✅ CORRECCIÓN Impostor: Obtener el ID del impostor como STRING para la comparación
            const impostorIdString = players[impostorIndex].userId.toString();

            const allWords = room.categoryId.words;
            const secretWordIndex = Math.floor(Math.random() * allWords.length);
            const secretWord = allWords[secretWordIndex];

            console.log('--- DEBUG START GAME ---');
            console.log('Total de jugadores:', totalPlayers);
            console.log('Índice elegido para Impostor:', impostorIndex);
            console.log('ID del Impostor (STRING):', impostorIdString);
            console.log('Palabra Secreta:', secretWord);
            console.log('Palabras de la Categoría:', allWords); // Verifica que el array no esté vacío
            console.log('------------------------');

            // 2. Actualizar el estado de la sala
            room.status = 'IN_GAME';
            // ✅ CORRECCIÓN Impostor: Asignar el ID del impostor en formato STRING a la sala
            room.impostorId = impostorIdString;
            room.secretWord = secretWord;
            room.words = allWords;
            room.currentRound = 1;
            room.status = 'IN_GAME';

            // const alivePlayerIds = players.map(p => p.userId.toString());
            room.turnOrder = shuffleArray(room.players.map(p => p.userId.toString())); room.currentTurnIndex = -1;
            room.turnStartTime = new Date();

            // 3. Asignar el rol de Impostor a cada jugador
            room.players = players.map(player => {
                const playerUserIdString = player.userId.toString();

                // Log para verificar la comparación de IDs en cada jugador
                console.log(`[MAPEO] Jugador: ${player.username} (ID: ${playerUserIdString})`);
                console.log(`[MAPEO] ¿Es Impostor? ${playerUserIdString === impostorIdString}`);

                return ({
                    ...player.toObject(),
                    // ✅ Asignación de Rol
                    isImpostor: playerUserIdString === impostorIdString,
                    clueGiven: null,
                    vote: null,
                    guessGiven: false,
                });
            });

            await room.save();

            // Respuesta de éxito al cliente que inició la partida
            res({
                success: true,
                message: "Partida iniciada. ¡Que comience la ronda 1!",
            });

            // Iniciar el juego notificando a los otros jugadores y estableciendo el primer turno
            await setNextTurn(room);
            io.to(roomCode).emit('game_started_update');
        } catch (error) {
            console.error("Error al iniciar la partida (Socket):", error);
            res({ success: false, message: "Error interno del servidor al iniciar la partida." });
        }
    });
}