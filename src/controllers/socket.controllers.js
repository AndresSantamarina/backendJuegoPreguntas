// import Room from "../database/model/Room.js";
// import Category from "../database/model/Category.js"
// import { io } from "../../index.js";

// const TURN_TIME_MS = 30000;
// const ROOM_TIMERS = {};

// const generateRoomId = () => {
//     const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
//     let result = '';
//     for (let i = 0; i < 4; i++) {
//         result += characters.charAt(Math.floor(Math.random() * characters.length));
//     }
//     return result;
// };

// const getSafeRoomData = (room) => ({
//     roomId: room.roomId,
//     status: room.status,
//     currentRound: room.currentRound,
//     currentTurnIndex: room.currentTurnIndex,
//     turnOrder: room.turnOrder,

//     players: room.players.map(p => ({
//         id: p.userId.toString(),
//         name: p.username,
//         isHost: p.userId.toString() === room.hostId.toString(),
//         lives: p.lives,
//         isAlive: p.isAlive,
//         clueGiven: p.clueGiven,
//         guessGiven: p.guessGiven
//     })),
// });

// const shuffleArray = (array) => {
//     for (let i = array.length - 1; i > 0; i--) {
//         const j = Math.floor(Math.random() * (i + 1));
//         [array[i], array[j]] = [array[j], array[i]];
//     }
//     return array;
// };

// const clearRoomTimer = (roomId) => {
//     if (ROOM_TIMERS[roomId]) {
//         clearTimeout(ROOM_TIMERS[roomId]);
//         delete ROOM_TIMERS[roomId];
//     }
// };

// const setNextTurn = async (room, isTimeout = false) => {
//     const roomCode = room.roomId;
//     clearRoomTimer(roomCode);

//     if (isTimeout && room.currentTurnIndex !== -1) {
//         const timedOutPlayerId = room.turnOrder[room.currentTurnIndex];
//         const timedOutPlayer = room.players.find(p => p.userId.toString() === timedOutPlayerId.toString());

//         if (timedOutPlayer && timedOutPlayer.clueGiven === null) {
//             timedOutPlayer.clueGiven = 'SKIPPED';
//             await room.save();

//             io.to(roomCode).emit('turn_skipped_timeout', {
//                 ...getSafeRoomData(room),
//                 message: `El turno de ${timedOutPlayer.username} ha expirado.`,
//             });
//         }
//     }

//     // 1. **Fase de PISTAS (IN_GAME)**
//     if (room.status === 'IN_GAME') {
//         let nextPlayerIndex = -1;
//         // Determine el punto de inicio de la búsqueda.
//         // Si currentTurnIndex es -1, startIndex es 0. Si no, es el siguiente índice.
//         let startIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
//         if (room.currentTurnIndex === -1) startIndex = 0; // Inicia en 0 si es la primera vez (desde resetRoundState)

//         let currentIndex = startIndex;

//         // **USAMOS UN BUCLE FOR PARA SIMPLIFICAR EL RECORRIDO CIRCULAR**
//         // Recorremos todos los jugadores de room.turnOrder para encontrar al siguiente.
//         for (let i = 0; i < room.turnOrder.length; i++) {
//             const playerId = room.turnOrder[currentIndex];
//             const player = room.players.find(p => p.userId.toString() === playerId.toString());

//             // Si el jugador está vivo Y NO ha dado pista
//             if (player && player.isAlive && player.clueGiven === null) {
//                 nextPlayerIndex = currentIndex;
//                 break; // Jugador encontrado
//             }

//             // Mover al siguiente índice circularmente
//             currentIndex = (currentIndex + 1) % room.turnOrder.length;
//         }

//         if (nextPlayerIndex !== -1) {
//             // A. Turno Encontrado (Primer o N-ésimo turno)
//             room.currentTurnIndex = nextPlayerIndex;
//             room.turnStartTime = new Date();
//             await room.save();

//             const nextTurnPlayerId = room.turnOrder[room.currentTurnIndex];
//             const nextTurnPlayer = room.players.find(p => p.userId.toString() === nextTurnPlayerId.toString());


//             // console.log(`[BE - NEXT TURN] Next Player ID: ${nextTurnPlayerId}`);
//             // console.log(`[BE - NEXT TURN] Current Index: ${room.currentTurnIndex}`);
//             // console.log(`[BE - NEXT TURN] Turn Order (First): ${room.turnOrder[0]}`);
//             // // Emitir el avance
//             // console.log("[DEBUG TURN] Emitiendo el índice CORRECTO (0) a través de 'turn_advanced'");
//             io.to(roomCode).emit('turn_advanced', {
//                 ...getSafeRoomData(room),
//                 // 🔥 CAMBIO CLAVE: Enviamos la ID del jugador actual de forma directa
//                 currentPlayerId: nextTurnPlayerId,
//                 nextTurnUsername: nextTurnPlayer.username,
//                 turnStartTime: room.turnStartTime.getTime(), // <-- Envía el timestamp
//                 turnDuration: TURN_TIME_MS
//             });
//             // Establecer el timer
//             ROOM_TIMERS[roomCode] = setTimeout(() => {
//                 setNextTurn(room, true);
//             }, TURN_TIME_MS);

//         } else {
//             // B. NADIE MÁS TIENE QUE DAR PISTA (Fin de la ronda de pistas)
//             room.status = 'VOTING';
//             room.votes = []; // Asegúrate de que este array esté vacío.
//             room.currentTurnIndex = -1;
//             room.turnStartTime = null;
//             // Guardamos el historial de pistas (¡Correcto!)
//             room.roundHistory.push({
//                 round: room.currentRound,
//                 clues: room.players
//                     .filter(p => p.clueGiven && p.clueGiven !== 'SKIPPED')
//                     .map(p => ({ userId: p.userId, clue: p.clueGiven }))
//             });

//             await room.save();

//             io.to(roomCode).emit('voting_started', {
//                 ...getSafeRoomData(room),
//                 message: "¡Fin de las pistas! Comienza la votación."
//             });
//         }
//     }
// };

// const handleTwoPlayersGame = async (room) => {
//     const alivePlayers = room.players.filter(p => p.isAlive);
//     const roomCode = room.roomId;

//     if (alivePlayers.length !== 2) return false;

//     // Es crucial que el impostor actual (el que tiene isImpostor: true) sea quien sepa la palabra clave.
//     const impostorPlayer = alivePlayers.find(p => p.isImpostor);

//     // Aquí, si usas la lógica de palabra secreta global, asegúrate de que room.secretWord esté actualizada
//     // Si la palabra clave cambia por ronda, debe ser elegida ANTES de llegar aquí.

//     room.status = 'GUESSING';
//     room.currentRound += 1;

//     clearRoomTimer(roomCode);

//     room.currentTurnIndex = -1;
//     room.turnStartTime = null;
//     room.players.forEach(p => {
//         p.clueGiven = null;
//         p.vote = null;
//         p.guessGiven = false;
//     });
//     room.votes = [];
//     room.turnOrder = shuffleArray(alivePlayers.map(p => p.userId.toString()));

//     // Necesitamos asegurarnos de que la palabra secreta esté establecida ANTES de guardar.
//     // Asumiendo que room.secretWord ya está establecida y es la palabra clave.

//     await room.save();

//     // El error de "la palabra no se encuentra en la lista" se resuelve
//     // enviando las palabras de la CATEGORÍA al frontend.
//     const category = await Category.findById(room.categoryId);

//     io.to(roomCode).emit('guessing_started', {
//         ...getSafeRoomData(room),
//         words: category.words, // ENVIAR LAS PALABRAS DE LA CATEGORÍA
//         message: "¡Solo quedan 2! Comienza la ronda de adivinanza. Adivinad la palabra clave de la lista."
//     });

//     return true;
// }

// const rotateImpostor = (players) => {
//     const currentImpostorId = players.find(p => p.isImpostor)?.userId.toString();
//     const alivePlayers = players.filter(p => p.isAlive);
//     let potentialImpostors = alivePlayers
//         .map(p => p.userId.toString())
//         .filter(id => id !== currentImpostorId);
//     if (potentialImpostors.length === 0 && alivePlayers.length > 0) {
//         potentialImpostors = [currentImpostorId];
//     }
//     const newImpostorId = potentialImpostors[Math.floor(Math.random() * potentialImpostors.length)];

//     players.forEach(p => {
//         p.isImpostor = (p.userId.toString() === newImpostorId);
//     });
//     return newImpostorId;
// };

// const resetRoundState = async (room) => {
//     console.log('*** EJECUTANDO resetRoundState: Limpieza y rotación. ***');
//     const alivePlayers = room.players.filter(p => p.isAlive);
//     const roomCode = room.roomId;

//     if (alivePlayers.length === 2) {
//         return await handleTwoPlayersGame(room);
//     }
//     if (alivePlayers.length < 2) {
//         room.status = 'FINISHED';
//         await room.save();
//         return false;
//     }

//     room.currentRound += 1;
//     room.status = 'IN_GAME';
//     rotateImpostor(room.players);
//     room.turnOrder = shuffleArray(alivePlayers.map(p => p.userId.toString()));
//     room.currentTurnIndex = -1;
//     room.turnStartTime = new Date();
//     room.players.forEach(p => {
//         p.clueGiven = null;
//         p.vote = null;
//         p.guessGiven = false;
//     });
//     room.votes = [];
//     room.impostorTarget = null; // Resetear el objetivo del impostor.
//     await room.save();
//     await setNextTurn(room);

//     return false;
// };

// export const handleSocketEvents = (io) => {
//     const createSafeCallback = (callback) => (response) => {
//         if (typeof callback === 'function') {
//             callback(response);
//         }
//     };
//     io.on('connection', (socket) => {
//         const userId = socket.userId;
//         const userName = socket.userName;
//         // console.log(`Socket Conectado: ${socket.id} (User: ${userName})`);

//         // --- 1. CREAR SALA ---
//         socket.on('createRoom', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { categoryName } = data;

//             try {
//                 const allCategories = await Category.find({});
//                 if (allCategories.length === 0) {
//                     return safeCallback({ success: false, message: "No hay categorías disponibles en la base de datos." });
//                 }

//                 let selectedCategory = null;

//                 if (!categoryName || categoryName.toLowerCase() === 'random') {
//                     const randomIndex = Math.floor(Math.random() * allCategories.length);
//                     selectedCategory = allCategories[randomIndex];
//                 } else {
//                     const foundCategory = allCategories.find(
//                         c => c.name.toUpperCase() === categoryName.toUpperCase()
//                     );
//                     if (!foundCategory) {
//                         return safeCallback({ success: false, message: `Categoría "${categoryName}" no válida.` });
//                     }
//                     selectedCategory = foundCategory;
//                 }

//                 if (!selectedCategory || selectedCategory.words.length < 2) {
//                     return safeCallback({ success: false, message: "La categoría seleccionada no tiene palabras suficientes." });
//                 }

//                 let roomId;
//                 let roomExists = true;
//                 while (roomExists) {
//                     roomId = generateRoomId();
//                     roomExists = await Room.findOne({ roomId });
//                 }

//                 const hostPlayer = {
//                     userId: userId,
//                     username: userName,
//                     lives: 3,
//                     isImpostor: false,
//                     isAlive: true,
//                     clueGiven: null,
//                     vote: null,
//                 };

//                 const newRoom = new Room({
//                     roomId,
//                     hostId: userId,
//                     players: [hostPlayer],
//                     categoryId: selectedCategory._id,
//                     status: 'LOBBY',
//                 });

//                 await newRoom.save();

//                 socket.join(roomId);
//                 safeCallback({
//                     success: true,
//                     roomId: roomId,
//                     room: getSafeRoomData(newRoom),
//                     message: `Sala creada con éxito. Categoría: ${selectedCategory.name}.`
//                 });

//             } catch (error) {
//                 console.error("Error al crear sala (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno al crear la sala." });
//             }
//         });


//         // --- 2. UNIRSE A SALA ---
//         socket.on('joinRoom', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { roomId } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 let room = await Room.findOne({ roomId: roomCode });

//                 if (!room) { safeCallback({ success: false, message: "Sala no encontrada." }); return }
//                 if (room.status !== 'LOBBY') return safeCallback({ success: false, message: "La partida ya ha comenzado." });
//                 const isPlayerInRoom = room.players.some(p => p.userId.toString() === userId.toString());

//                 if (isPlayerInRoom) {
//                     socket.join(roomCode);
//                     return safeCallback({ success: true, roomId: roomCode, room: getSafeRoomData(room), message: "Ya estás en esta sala." });
//                 }

//                 if (room.players.length >= room.maxPlayers) {
//                     return safeCallback({ success: false, message: "La sala está llena (4/4)." });
//                 }

//                 const newPlayer = {
//                     userId: userId,
//                     username: userName,
//                     lives: 3,
//                     isImpostor: false,
//                     isAlive: true,
//                     clueGiven: null,
//                     vote: null,
//                 };

//                 room.players.push(newPlayer);
//                 console.log('Jugadores ANTES de guardar:', room.players.map(p => p.username));
//                 await room.save();

//                 room = await Room.findOne({ roomId: roomCode });
//                 console.log('Jugadores DESPUÉS de recargar (FRESH):', room.players.map(p => p.username));

//                 socket.join(roomCode);
//                 console.log('Emitiendo a sala', roomCode, 'con', room.players.length, 'jugadores.');
//                 io.to(roomCode).emit(`player_update_${roomCode}`, {
//                     ...getSafeRoomData(room), // Enviamos toda la data de la sala (incluyendo la lista de players)
//                     message: `${userName} se ha unido al lobby.` // Opcional, pero útil
//                 });

//                 safeCallback({

//                     success: true,
//                     roomId: roomCode,
//                     room: getSafeRoomData(room),
//                     message: `Te has unido a la sala ${roomCode}.`

//                 });
//                 console.log('Callback a', userName, 'con estado de sala:', getSafeRoomData(room).players.map(p => p.username));

//             } catch (error) {
//                 console.error("Error al unirse a sala (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno al unirse a la sala." });
//             }
//         });

//         socket.on('getGameState', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { roomId, userId } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 const room = await Room.findOne({ roomId: roomCode }).populate('categoryId', 'words');

//                 if (!room) { safeCallback({ success: false, message: 'Sala no encontrada.' }); return }

//                 const player = room.players.find(p => p.userId.toString() === userId.toString());
//                 if (!player) return safeCallback({ success: false, message: 'No eres jugador de esta sala.' });

//                 socket.join(roomCode);

//                 const myRole = player.isImpostor ? 'IMPOSTOR' : 'INNOCENT';
//                 const myKeyword = player.isImpostor ? room.categoryId.words.find(w => w !== room.secretWord) : room.secretWord;

//                 safeCallback({
//                     success: true,
//                     room: {
//                         ...getSafeRoomData(room),
//                         words: room.categoryId.words,
//                     },
//                     myRole: myRole,
//                     myKeyword: myKeyword,
//                     message: 'Estado de juego cargado.'
//                 });

//             } catch (error) {
//                 console.error("Error al obtener estado (Socket):", error);
//                 safeCallback({ success: false, message: 'Error al obtener estado de la sala.' });
//             }
//         });


//         // --- 3. INICIAR PARTIDA ---
//         socket.on('startGame', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { roomId } = data;
//             const roomCode = roomId.toUpperCase();
//             // console.log(`[DEBUG START] Inicia el manejo de startGame para sala: ${roomCode}`);
//             try {
//                 const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');
//                 if (!room) { safeCallback({ success: false, message: "Sala no encontrada." }); return }
//                 if (room.hostId.toString() !== userId.toString()) {
//                     safeCallback({ success: false, message: "Solo el anfitrión puede iniciar la partida." });
//                     return;
//                 }
//                 if (room.players.length !== room.maxPlayers) return safeCallback({ success: false, message: `Se necesitan ${room.maxPlayers} jugadores para empezar.` });
//                 if (room.status !== 'LOBBY') return safeCallback({ success: false, message: "La partida ya ha comenzado." });
//                 console.log(`[START GAME] Validación OK. Iniciando lógica del juego.`);
//                 const players = room.players;
//                 const totalPlayers = players.length;
//                 const impostorIndex = Math.floor(Math.random() * totalPlayers);
//                 const impostorId = players[impostorIndex].userId;
//                 const allWords = room.categoryId.words;
//                 const secretWordIndex = Math.floor(Math.random() * allWords.length);
//                 const secretWord = allWords[secretWordIndex];

//                 room.status = 'IN_GAME';
//                 room.impostorId = impostorId;
//                 room.secretWord = secretWord;
//                 room.currentRound = 1;

//                 const alivePlayerIds = players.map(p => p.userId.toString());
//                 room.turnOrder = shuffleArray(alivePlayerIds);
//                 room.currentTurnIndex = -1;
//                 room.turnStartTime = new Date();

//                 room.players = players.map(player => ({
//                     ...player.toObject(),
//                     isImpostor: player.userId.toString() === impostorId.toString(),
//                     clueGiven: null,
//                     vote: null,
//                     guessGiven: false,
//                 }));

//                 await room.save();

//                 safeCallback({
//                     success: true,
//                     message: "Partida iniciada. ¡Que comience la ronda 1!",
//                 });

//                 await setNextTurn(room);
//             } catch (error) {
//                 console.error("Error al iniciar la partida (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno del servidor al iniciar la partida." });
//             }
//         });

//         socket.on('submitClue', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { roomId, clue } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 const room = await Room.findOne({ roomId: roomCode });

//                 if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
//                 if (room.status !== 'IN_GAME') return safeCallback({ success: false, message: "El juego no está en curso." });

//                 const playerIndexInPlayers = room.players.findIndex(p => p.userId.toString() === userId.toString());
//                 if (playerIndexInPlayers === -1) return safeCallback({ success: false, message: "No eres un jugador en esta sala." });

//                 const currentPlayer = room.players[playerIndexInPlayers];
//                 const currentTurnPlayerId = room.turnOrder[room.currentTurnIndex];
//                 if (currentTurnPlayerId.toString() !== userId.toString()) return safeCallback({ success: false, message: "No es tu turno." });

//                 if (currentPlayer.clueGiven) return safeCallback({ success: false, message: "Ya has dado tu pista para esta ronda." });
//                 if (!clue || clue.trim().length === 0) return safeCallback({ success: false, message: "La pista no puede estar vacía." });
//                 currentPlayer.clueGiven = clue.trim();
//                 await room.save();
//                 safeCallback({ success: true, message: "Pista enviada." });
//                 const updatedRoom = await Room.findOne({ roomId: roomCode });
//                 if (!updatedRoom) return;
//                 await setNextTurn(updatedRoom);

//             } catch (error) {
//                 console.error("Error al enviar la pista (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno del servidor al enviar la pista." });
//             }
//         });

//         // --- 5. ENVIAR VOTO (MODIFICADO) ---
//         socket.on('submitVote', async (data, callback) => {
//             let roundWasReset = false; // 🛑 Bandera de sincronización

//             // Función auxiliar para forzar la limpieza de votos y la transición a IMPOSTOR_CHOOSING
//             const resetVotesAndStartImpostorChoosing = (room, roomCode, message) => {
//                 // 🛑 CLAVE DE LA CORRECCIÓN: Limpiar votos de los jugadores y la sala.
//                 console.log('Limpiando votos. Status: IMPOSTOR_CHOOSING.');
//                 room.players.forEach(p => { p.vote = null; });
//                 room.votes = [];
//                 room.status = 'IMPOSTOR_CHOOSING';

//                 io.to(roomCode).emit('impostor_choosing', {
//                     ...getSafeRoomData(room),
//                     message: message
//                 });
//             };

//             const resetAndEmitRound = async (room, roomCode, baseMessage) => {
//                 // Asume que resetRoundState ya hace p.vote = null y room.votes = []
//                 console.log('Reiniciando ronda (resetRoundState). Status: IN_GAME.');
//                 const isTwoPlayerMode = await resetRoundState(room);
//                 roundWasReset = true; // 🛑 Marcamos que el documento Mongoose fue modificado externamente

//                 // Nota: Si 'room' es un objeto Mongoose, puede que necesites hacer un 'room = await Room.findOne(...)'
//                 // aquí si resetRoundState no actualiza 'room' por referencia. Lo manejamos al final por simplicidad.

//                 if (!isTwoPlayerMode) {
//                     io.to(roomCode).emit('round_new', {
//                         ...getSafeRoomData(room),
//                         message: baseMessage + ` La ronda ${room.currentRound} comienza.`
//                     });
//                 }
//             };

//             const safeCallback = createSafeCallback(callback);
//             const { roomId, targetId } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 let room = await Room.findOne({ roomId: roomCode });
//                 if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
//                 if (room.status !== 'VOTING') return safeCallback({ success: false, message: "No es el momento de votar." });

//                 // Nota: 'voter' es una referencia directa a un objeto dentro de la colección 'room.players'.
//                 const voter = room.players.find(p => p.userId.toString() === userId.toString());
//                 const target = room.players.find(p => p.userId.toString() === targetId.toString());

//                 if (!voter || !target) return safeCallback({ success: false, message: "Jugador o objetivo no válido." });
//                 if (!voter.isAlive || !target.isAlive) return safeCallback({ success: false, message: "Solo jugadores vivos pueden votar o ser votados." });
//                 if (voter.vote) return safeCallback({ success: false, message: "Ya has votado en esta ronda." });

//                 // Registrar el voto
//                 voter.vote = targetId;
//                 room.votes.push({ voterId: userId, targetId });
//                 console.log('Jugador', voter.username, 'votó por', target.username);


//                 const alivePlayers = room.players.filter(p => p.isAlive);
//                 const votesSubmitted = alivePlayers.filter(p => p.vote !== null).length;

//                 // Guardamos el voto inmediatamente
//                 await room.save();
//                 console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));

//                 let outcomeMessage = "Voto registrado. Esperando a los demás jugadores...";

//                 if (votesSubmitted === alivePlayers.length) {
//                     // --- CÁLCULO DE VOTOS ---
//                     const voteCounts = {};
//                     alivePlayers.forEach(p => {
//                         if (p.vote) {
//                             voteCounts[p.vote] = (voteCounts[p.vote] || 0) + 1;
//                         }
//                     });

//                     let maxVotes = 0;
//                     let mostVotedIds = [];

//                     for (const playerId in voteCounts) {
//                         const count = voteCounts[playerId];
//                         if (count > maxVotes) {
//                             maxVotes = count;
//                             mostVotedIds = [playerId];
//                         } else if (count === maxVotes) {
//                             mostVotedIds.push(playerId);
//                         }
//                     }

//                     const tie = mostVotedIds.length !== 1 || maxVotes === 0;
//                     const impostorPlayer = room.players.find(p => p.isImpostor === true);
//                     const mostVotedPlayer = !tie
//                         ? room.players.find(p => p.userId.toString() === mostVotedIds[0].toString())
//                         : null;

//                     // -----------------------------------------------------------
//                     // 1. CASO: EMPATE o NADIE FUE VOTADO (Impulsa el ataque del Impostor)
//                     // -----------------------------------------------------------
//                     if (tie) {
//                         if (impostorPlayer && impostorPlayer.isAlive) {
//                             outcomeMessage = "¡Empate en la votación! El Impostor debe elegir una víctima.";
//                             resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
//                             roundWasReset = true;
//                         } else {
//                             await resetAndEmitRound(room, roomCode, "Empate. La ronda se reinicia.");
//                         }

//                         // -----------------------------------------------------------
//                         // 2. CASO: UN ÚNICO JUGADOR MÁS VOTADO
//                         // -----------------------------------------------------------
//                     } else if (mostVotedPlayer) {

//                         if (mostVotedPlayer.isImpostor) {
//                             mostVotedPlayer.lives -= 1;
//                             outcomeMessage = `¡Encontrado! El impostor (${mostVotedPlayer.username}) pierde una vida. Vidas restantes: ${mostVotedPlayer.lives}.`;

//                             if (mostVotedPlayer.lives <= 0) {
//                                 mostVotedPlayer.isAlive = false;
//                                 room.status = 'FINISHED';
//                                 outcomeMessage += " Los **Inocentes** ganan.";

//                                 io.to(roomCode).emit('game_finished', {
//                                     winner: 'Innocents',
//                                     message: outcomeMessage,
//                                     finalRoomState: getSafeRoomData(room)
//                                 });
//                             } else {
//                                 // 🛑 CASO CLAVE: Impostor pierde vida pero sigue vivo.
//                                 await resetAndEmitRound(room, roomCode, outcomeMessage);
//                             }

//                         } else {
//                             // Voto fallido a Inocente
//                             outcomeMessage = `¡Voto fallido! ${mostVotedPlayer.username} es Inocente. El Impostor debe elegir una víctima.`;
//                             resetVotesAndStartImpostorChoosing(room, roomCode, outcomeMessage);
//                             roundWasReset = true;
//                         }
//                     } else {
//                         await resetAndEmitRound(room, roomCode, "Error de lógica de votación. Reiniciando ronda.");
//                     }

//                     // --- Lógica de 2 jugadores (Post-evaluación del voto) ---
//                     const currentAliveCount = room.players.filter(p => p.isAlive).length;

//                     if (room.status !== 'FINISHED' && room.status !== 'IMPOSTOR_CHOOSING' && room.status !== 'IN_GAME') {
//                         if (currentAliveCount === 2) {
//                             await handleTwoPlayersGame(room);
//                             outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
//                         }
//                     }

//                     // 🛑 Guardamos el estado final después de todos los cambios de fase/ronda.
//                     await room.save();
//                     console.log('Estado final de los votos ANTES de salir:', room.players.map(p => ({ user: p.username, vote: p.vote })));
//                 }

//                 // 🛑 LÓGICA DE SINCRONIZACIÓN DE ESTADO PARA EL CALLBACK
//                 if (roundWasReset || room.status !== 'VOTING') {
//                     // Re-cargamos el documento para obtener el estado más fresco, crucial para el 'voter.vote'
//                     // que fue limpiado en resetRoundState.
//                     room = await Room.findOne({ roomId: roomCode });

//                     // Re-asignamos 'voter' para apuntar al objeto actualizado.
//                     const updatedVoter = room.players.find(p => p.userId.toString() === userId.toString());

//                     safeCallback({
//                         success: true,
//                         message: outcomeMessage,
//                         currentStatus: room.status,
//                         // Usamos el estado 'vote' del documento re-cargado.
//                         voterVote: updatedVoter ? updatedVoter.vote : null
//                     });
//                 } else {
//                     // Comportamiento normal (voto registrado, esperando más votos)
//                     safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status, voterVote: voter.vote });
//                 }


//             } catch (error) {
//                 console.error("Error al votar (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno del servidor al procesar el voto." });
//             }
//         });

//         // --- 6. ELEGIR OBJETIVO (AJUSTADO) ---
//         socket.on('chooseTarget', async (data, callback) => {
//             let roundWasReset = false; // 🛑 Bandera de sincronización para este handler
//             const resetAndEmitRound = async (room, roomCode, baseMessage) => {
//                 // LLama a resetRoundState, que ROTARÁ el impostor.
//                 const isTwoPlayerMode = await resetRoundState(room);
//                 roundWasReset = true; // Marcamos que el documento Mongoose fue modificado externamente

//                 // Si resetRoundState no activó el modo de 2 jugadores...
//                 if (!isTwoPlayerMode) {
//                     // Asumimos que resetRoundState ya guardó la sala
//                     io.to(roomCode).emit('round_new', {
//                         ...getSafeRoomData(room),
//                         message: baseMessage + ` La ronda ${room.currentRound} comienza.`
//                     });
//                 }
//                 // Si es modo 2 jugadores, handleTwoPlayersGame ya emitió el evento 'guessing_started'
//             };
//             const safeCallback = createSafeCallback(callback);
//             const { roomId, targetId } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 let room = await Room.findOne({ roomId: roomCode });
//                 if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
//                 if (room.status !== 'IMPOSTOR_CHOOSING') return safeCallback({ success: false, message: "No es el momento de elegir un objetivo." });
//                 const killer = room.players.find(p => p.userId.toString() === userId.toString());
//                 const victim = room.players.find(p => p.userId.toString() === targetId.toString());

//                 // Verificar el rol del atacante (¡Debe ser el impostor ACTUAL!)
//                 if (!killer || !killer.isImpostor) return safeCallback({ success: false, message: "Solo el Impostor puede atacar." });
//                 if (!victim || !victim.isAlive) return safeCallback({ success: false, message: "Objetivo no válido." });

//                 // El ataque se realiza: la víctima pierde una vida.
//                 victim.lives -= 1;
//                 let outcomeMessage = `${victim.username} fue atacado(a) por el Impostor. Vidas restantes: ${victim.lives}.`;

//                 if (victim.lives <= 0) {
//                     victim.isAlive = false;
//                     outcomeMessage += ` ${victim.username} ha sido eliminado(a).`;
//                 }
//                 const aliveInnocents = room.players.filter(p => p.isAlive && !p.isImpostor).length;
//                 const currentAliveCount = room.players.filter(p => p.isAlive).length;

//                 if (aliveInnocents === 0) {
//                     // FIN DE JUEGO: Impostor gana
//                     room.status = 'FINISHED';
//                     outcomeMessage += ` El Impostor (${killer.username}) gana.`;

//                     io.to(roomCode).emit('game_finished', {
//                         winner: 'Impostor',
//                         message: outcomeMessage,
//                         finalRoomState: getSafeRoomData(room)
//                     });
//                 } else if (currentAliveCount === 2) {
//                     // Modo de 2 jugadores
//                     await handleTwoPlayersGame(room);
//                     roundWasReset = true; // handleTwoPlayersGame también puede cambiar el estado de la sala
//                     outcomeMessage += ` ¡Solo quedan 2! Comienza el modo adivinanza.`;
//                 } else {
//                     // Reiniciar la ronda (Esto rotará el impostor para la próxima vez)
//                     await resetAndEmitRound(room, roomCode, outcomeMessage);
//                 }

//                 await room.save();
//                 // 🛑 LÓGICA DE SINCRONIZACIÓN DE ESTADO PARA EL CALLBACK
//                 if (roundWasReset || room.status !== 'IMPOSTOR_CHOOSING') {
//                     // Re-cargamos el documento para obtener el estado más fresco
//                     room = await Room.findOne({ roomId: roomCode });
//                 }
//                 safeCallback({ success: true, message: outcomeMessage, currentStatus: room.status });

//             } catch (error) {
//                 console.error("Error en submitKillTarget:", error);
//                 safeCallback({ success: false, message: "Error interno del servidor al procesar el ataque." });
//             }
//         });

//         // --- 7. ENVIAR ADIVINANZA (NUEVO - Modo 2 Jugadores) ---
//         socket.on('submitGuess', async (data, callback) => {
//             const safeCallback = createSafeCallback(callback);
//             const { roomId, guessedWord } = data;
//             const roomCode = roomId.toUpperCase();

//             try {
//                 const room = await Room.findOne({ roomId: roomCode }).populate('categoryId');

//                 if (!room) return safeCallback({ success: false, message: "Sala no encontrada." });
//                 if (room.status !== 'GUESSING') return safeCallback({ success: false, message: "No es el momento de adivinar." });

//                 const player = room.players.find(p => p.userId.toString() === userId.toString());
//                 if (!player || player.guessGiven) return safeCallback({ success: false, message: "Ya has intentado adivinar o no eres un jugador." });

//                 const wordGrid = room.categoryId.words;
//                 if (!wordGrid.includes(guessedWord)) return safeCallback({ success: false, message: "La palabra no está en la lista." });

//                 player.guessGiven = true;
//                 await room.save();

//                 const isCorrect = guessedWord === room.secretWord;
//                 const otherPlayer = room.players.find(p => p.userId.toString() !== userId.toString() && p.isAlive);
//                 const allGuessed = room.players.filter(p => p.isAlive).every(p => p.guessGiven);

//                 let outcomeMessage = `${player.username} adivinó: ${guessedWord}.`;

//                 if (isCorrect) {
//                     room.status = 'FINISHED';
//                     const winnerRole = player.isImpostor ? 'Impostor' : 'Innocents';
//                     outcomeMessage = `¡${player.username} ha adivinado la palabra clave: ${room.secretWord}! El bando **${winnerRole}** gana.`;

//                     io.to(roomCode).emit('game_finished', {
//                         winner: winnerRole,
//                         message: outcomeMessage,
//                         finalRoomState: getSafeRoomData(room)
//                     });
//                 } else if (allGuessed) {
//                     room.players.filter(p => p.isAlive).forEach(p => {
//                         p.guessGiven = false;
//                     });

//                     outcomeMessage = `Ambos jugadores fallaron. ¡Tienen otra oportunidad!`;
//                     io.to(roomCode).emit('guessing_next_attempt', {
//                         ...getSafeRoomData(room),
//                         secretWord: room.secretWord,
//                         message: outcomeMessage
//                     });
//                 } else {
//                     outcomeMessage += " Esperando al otro jugador...";
//                     io.to(roomCode).emit('guess_submitted', {
//                         ...getSafeRoomData(room),
//                         message: outcomeMessage
//                     });
//                 }

//                 await room.save();

//                 safeCallback({ success: true, message: outcomeMessage, isCorrect: isCorrect, isFinished: room.status === 'FINISHED' });

//             } catch (error) {
//                 console.error("Error al enviar adivinanza (Socket):", error);
//                 safeCallback({ success: false, message: "Error interno del servidor al enviar la adivinanza." });
//             }
//         });

//         // --- MANEJO DE DESCONEXIÓN ---
//         socket.on('disconnect', async () => {
//             // console.log(`Socket Desconectado: ${socket.id} (User: ${userName})`);
//             try {
//                 const room = await Room.findOne({ "players.userId": userId, status: { $in: ['LOBBY', 'IN_GAME'] } });

//                 if (room) {
//                     const player = room.players.find(p => p.userId.toString() === userId.toString());

//                     if (room.status === 'LOBBY') {
//                         room.players = room.players.filter(p => p.userId.toString() !== userId.toString());
//                         await room.save();

//                         io.to(room.roomId).emit(`player_update_${room.roomId}`, {
//                             players: getSafeRoomData(room).players
//                         });

//                         // console.log(`Jugador ${userName} eliminado del lobby ${room.roomId}.`);

//                     } else if (room.status === 'IN_GAME') {
//                         player.isAlive = false;
//                         player.lives = 0;
//                         await room.save();

//                         io.to(room.roomId).emit('game_status_update', {
//                             ...getSafeRoomData(room),
//                             message: `⚠️ ¡El jugador ${userName} se ha desconectado y ha sido eliminado de la partida!`
//                         });

//                         // 1. Comprobar si termina la partida por desconexión
//                         const aliveInnocents = room.players.filter(p => p.isAlive && !p.isImpostor).length;
//                         if (aliveInnocents === 0 && room.impostorId) {
//                             room.status = 'FINISHED';
//                             await room.save();
//                             io.to(room.roomId).emit('game_finished', {
//                                 winner: 'Impostor',
//                                 message: `¡El impostor gana la partida! El último inocente se desconectó.`,
//                                 finalRoomState: getSafeRoomData(room)
//                             });
//                             clearRoomTimer(room.roomId);
//                         }
//                         if (room.status === 'IN_GAME' && room.turnOrder[room.currentTurnIndex]?.toString() === userId.toString()) {
//                             await setNextTurn(room);
//                         }
//                         const currentAlivePlayers = room.players.filter(p => p.isAlive).length;
//                         if (currentAlivePlayers === 2 && room.status !== 'FINISHED') {
//                             await handleTwoPlayersGame(room);
//                         }
//                     }
//                 }
//             } catch (error) {
//                 console.error("Error al manejar la desconexión:", error);
//             }
//         });
//     });

// };

