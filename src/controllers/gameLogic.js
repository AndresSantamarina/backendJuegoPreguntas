import Room from "../database/model/Room.js";
import Category from "../database/model/Category.js"
import User from "../database/model/User.js";
import { io } from "../../index.js";

const TURN_TIME_MS = 30000;
const ROOM_TIMERS = {};

const generateRoomId = () => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

const getSafeRoomData = (room) => {
    const roomObject = room.toObject ? room.toObject() : room;

    return {
        roomId: room.roomId,
        status: room.status,
        currentRound: room.currentRound,
        currentTurnIndex: room.currentTurnIndex,
        turnOrder: room.turnOrder,
        turnStartTime: room.turnStartTime,
        turnDuration: TURN_TIME_MS, // Asumiendo que es constante

        players: room.players.map(p => ({
            id: p.userId.toString(),
            name: p.username,
            isHost: p.userId.toString() === room.hostId.toString(),
            lives: p.lives,
            isAlive: p.isAlive,
            clueGiven: p.clueGiven,
            guessGiven: p.guessGiven,
            isImpostor: p.isImpostor // ¡Esto es necesario para que el frontend lo visualice!
        })),
    }
};

const shuffleArray = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

const clearRoomTimer = (roomId) => {
    if (ROOM_TIMERS[roomId]) {
        clearTimeout(ROOM_TIMERS[roomId]);
        delete ROOM_TIMERS[roomId];
    }
};

const setNextTurn = async (room, isTimeout = false) => {
    const roomCode = room.roomId;
    clearRoomTimer(roomCode);

    if (isTimeout && room.currentTurnIndex !== -1) {
        const timedOutPlayerId = room.turnOrder[room.currentTurnIndex];
        const timedOutPlayer = room.players.find(p => p.userId.toString() === timedOutPlayerId.toString());

        if (timedOutPlayer && timedOutPlayer.clueGiven === null) {
            timedOutPlayer.clueGiven = 'SKIPPED';
            await room.save();

            io.to(roomCode).emit('turn_skipped_timeout', {
                ...getSafeRoomData(room),
                message: `El turno de ${timedOutPlayer.username} ha expirado.`,
            });
        }
    }

    if (room.status === 'IN_GAME') {
        let nextPlayerIndex = -1;
        let startIndex;
        // 🚨 LOG 1: Verificar el estado del turno y el índice inicial
        console.log(`[SET_TURN] Estado de la Sala: ${room.status}, Turno Anterior: ${room.currentTurnIndex}`);
        console.log(`[SET_TURN] turnOrder completo: ${room.turnOrder.map(id => id.toString())}`);
        // let startIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;

        if (room.currentTurnIndex === -1) {
            startIndex = 0;
        } else {
            startIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
        }

        let currentIndex = startIndex;

        for (let i = 0; i < room.turnOrder.length; i++) {
            const playerId = room.turnOrder[currentIndex];
            const playerIdString = playerId.toString();
            const player = room.players.find(p => p.userId.toString() === playerIdString);
            if (player) {
                console.log(`[SET_TURN] Iteración ${i} (Índice ${currentIndex}):`);
                console.log(`  -> ID de turnOrder (playerIdString): ${playerIdString} (Tipo: ${typeof playerIdString})`);
                console.log(`  -> ID del Jugador (p.userId.toString()): ${player.userId.toString()} (Tipo: ${typeof player.userId.toString()})`);
                console.log(`  -> ¿Está Vivo? ${player.isAlive}`);
                console.log(`  -> Valor de clueGiven: ${player.clueGiven} (Tipo: ${typeof player.clueGiven})`);
            } else {
                console.log(`[SET_TURN] Error: No se encontró el jugador con ID ${playerIdString} en room.players.`);
            }
            if (player && player.isAlive && player.clueGiven === null) {
                nextPlayerIndex = currentIndex;
                break;
            }

            currentIndex = (currentIndex + 1) % room.turnOrder.length;
        }

        if (nextPlayerIndex !== -1) {
            room.currentTurnIndex = nextPlayerIndex;
            room.turnStartTime = new Date();
            await room.save();
            const nextTurnPlayerId = room.turnOrder[room.currentTurnIndex];
            const nextTurnPlayer = room.players.find(p => p.userId.toString() === nextTurnPlayerId.toString());

            io.to(room.roomId).emit('turn_advanced', {
                ...getSafeRoomData(room),
                currentPlayerId: room.currentTurnPlayerId,
                nextTurnUsername: nextTurnPlayer.username,
                turnStartTime: room.turnStartTime.getTime(),
                turnDuration: TURN_TIME_MS
            });
            ROOM_TIMERS[roomCode] = setTimeout(() => {
                setNextTurn(room, true);
            }, TURN_TIME_MS);

        } else {
            room.status = 'VOTING';
            room.votes = [];
            room.currentTurnIndex = -1;
            room.turnStartTime = null;
            room.roundHistory.push({
                round: room.currentRound,
                clues: room.players
                    .filter(p => p.clueGiven && p.clueGiven !== 'SKIPPED')
                    .map(p => ({ userId: p.userId, clue: p.clueGiven }))
            });

            await room.save();

            io.to(roomCode).emit('voting_started', {
                ...getSafeRoomData(room),
                message: "¡Fin de las pistas! Comienza la votación."
            });
        }
    }
};

const handleTwoPlayersGame = async (room) => {
    const alivePlayers = room.players.filter(p => p.isAlive);
    const roomCode = room.roomId;

    if (alivePlayers.length !== 2) return false;

    const impostorPlayer = alivePlayers.find(p => p.isImpostor);

    room.status = 'GUESSING';
    room.currentRound += 1;

    clearRoomTimer(roomCode);

    room.currentTurnIndex = 0;
    room.turnStartTime = null;
    room.players.forEach(p => {
        p.clueGiven = null;
        p.vote = null;
        p.guessGiven = false;
    });
    room.votes = [];
    room.turnOrder = room.players
        .filter(p => p.isAlive)
        .map(p => p.userId.toString());

    if (room.turnOrder.length !== 2) {
        console.error("Error FATAL: handleTwoPlayersGame tiene más de 2 jugadores vivos en turnOrder.");
        return false; // Evitar iniciar la fase de adivinanza
    }

    room.currentTurnIndex = 0; // Se fuerza a 0 para el inicio
    await room.save();

    const category = await Category.findById(room.categoryId);

    io.to(roomCode).emit('guessing_started', {
        ...getSafeRoomData(room),
        words: category.words,
        message: "¡Solo quedan 2! Comienza la ronda de adivinanza. Adivinad la palabra clave de la lista."
    });

    return true;
}

const rotateImpostor = (players) => {
    const currentImpostorId = players.find(p => p.isImpostor)?.userId.toString();
    const alivePlayers = players.filter(p => p.isAlive);
    let potentialImpostors = alivePlayers
        .map(p => p.userId.toString())
        .filter(id => id !== currentImpostorId);
    if (potentialImpostors.length === 0 && alivePlayers.length > 0) {
        potentialImpostors = [currentImpostorId];
    }
    const newImpostorId = potentialImpostors[Math.floor(Math.random() * potentialImpostors.length)];

    players.forEach(p => {
        p.isImpostor = (p.userId.toString() === newImpostorId);
    });
    return newImpostorId;
};


const resetRoundState = async (room) => {
    console.log('*** EJECUTANDO resetRoundState: Limpieza y rotación. ***');
    const alivePlayers = room.players.filter(p => p.isAlive);
    const roomCode = room.roomId;

    if (alivePlayers.length === 2) {
        return await handleTwoPlayersGame(room);
    }
    if (alivePlayers.length < 2) {
        room.status = 'FINISHED';
        await room.save();
        return false;
    }

    room.currentRound += 1;
    room.status = 'IN_GAME';
    rotateImpostor(room.players);
    room.turnOrder = shuffleArray(alivePlayers.map(p => p.userId.toString()));
    room.currentTurnIndex = -1;
    room.turnStartTime = new Date();
    room.players.forEach(p => {
        p.clueGiven = null;
        p.vote = null;
        p.guessGiven = false;
    });


    const newCategoryArray = await Category.aggregate([{ $sample: { size: 1 } }]);

    if (!newCategoryArray || newCategoryArray.length === 0) {
        console.error("FATAL: No se pudo cargar la categoría para la rotación. Usando la anterior.");
        // Si no se encuentra una nueva, el juego continúa con la palabra anterior
    } else {
        // El resultado de aggregate es un array de objetos planos, usamos el primero
        const selectedCategory = newCategoryArray[0];
        const allWords = selectedCategory.words;

        // 3.1 Actualizar ID de Categoría en la Sala
        room.categoryId = selectedCategory._id;

        // 3.2 Seleccionar y asignar la Palabra Secreta
        const shuffledWords = shuffleArray([...allWords]);

        // 🔑 Guardar la lista COMPLETA de palabras (Necesario para el modo adivinanza)
        room.words = allWords;

        // Asignar la nueva palabra clave
        room.secretWord = shuffledWords[0];

        // ⚠️ Si utilizas 'impostorWord' en algún lugar, debes reintroducirlo aquí. 
        // Si el impostor simplemente no conoce la palabra, basta con 'secretWord'.
        // room.impostorWord = shuffledWords[1]; 
    }
    room.votes = [];
    room.impostorTarget = null;

    await room.save();
    await setNextTurn(room);

    io.to(room.roomId).emit('round_new', {
        currentRound: room.currentRound,
        message: "Nueva ronda, ¡a jugar!"
    });

    io.to(room.roomId).emit('game_started_update'); // <--- ¡Añade esto!

    return false;
};

export {
    generateRoomId,
    getSafeRoomData,
    shuffleArray,
    clearRoomTimer,
    setNextTurn,
    handleTwoPlayersGame,
    rotateImpostor,
    resetRoundState,
};
