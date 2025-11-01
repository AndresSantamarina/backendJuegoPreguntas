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

const getSafeRoomData = (room) => ({
    roomId: room.roomId,
    status: room.status,
    currentRound: room.currentRound,
    currentTurnIndex: room.currentTurnIndex,
    turnOrder: room.turnOrder,

    players: room.players.map(p => ({
        id: p.userId.toString(),
        name: p.username,
        isHost: p.userId.toString() === room.hostId.toString(),
        lives: p.lives,
        isAlive: p.isAlive,
        clueGiven: p.clueGiven,
        guessGiven: p.guessGiven
    })),
});

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

    // 1. **Fase de PISTAS (IN_GAME)**
    if (room.status === 'IN_GAME') {
        let nextPlayerIndex = -1;
        // Determine el punto de inicio de la búsqueda.
        // Si currentTurnIndex es -1, startIndex es 0. Si no, es el siguiente índice.
        let startIndex = (room.currentTurnIndex + 1) % room.turnOrder.length;
        if (room.currentTurnIndex === -1) startIndex = 0; // Inicia en 0 si es la primera vez (desde resetRoundState)

        let currentIndex = startIndex;

        // **USAMOS UN BUCLE FOR PARA SIMPLIFICAR EL RECORRIDO CIRCULAR**
        // Recorremos todos los jugadores de room.turnOrder para encontrar al siguiente.
        for (let i = 0; i < room.turnOrder.length; i++) {
            const playerId = room.turnOrder[currentIndex];
            const player = room.players.find(p => p.userId.toString() === playerId.toString());

            // Si el jugador está vivo Y NO ha dado pista
            if (player && player.isAlive && player.clueGiven === null) {
                nextPlayerIndex = currentIndex;
                break; // Jugador encontrado
            }

            // Mover al siguiente índice circularmente
            currentIndex = (currentIndex + 1) % room.turnOrder.length;
        }

        if (nextPlayerIndex !== -1) {
            // A. Turno Encontrado (Primer o N-ésimo turno)
            room.currentTurnIndex = nextPlayerIndex;
            room.turnStartTime = new Date();
            await room.save();

            const nextTurnPlayerId = room.turnOrder[room.currentTurnIndex];
            const nextTurnPlayer = room.players.find(p => p.userId.toString() === nextTurnPlayerId.toString());


            // console.log(`[BE - NEXT TURN] Next Player ID: ${nextTurnPlayerId}`);
            // console.log(`[BE - NEXT TURN] Current Index: ${room.currentTurnIndex}`);
            // console.log(`[BE - NEXT TURN] Turn Order (First): ${room.turnOrder[0]}`);
            // // Emitir el avance
            // console.log("[DEBUG TURN] Emitiendo el índice CORRECTO (0) a través de 'turn_advanced'");
            io.to(roomCode).emit('turn_advanced', {
                ...getSafeRoomData(room),
                // 🔥 CAMBIO CLAVE: Enviamos la ID del jugador actual de forma directa
                currentPlayerId: nextTurnPlayerId,
                nextTurnUsername: nextTurnPlayer.username,
                turnStartTime: room.turnStartTime.getTime(), // <-- Envía el timestamp
                turnDuration: TURN_TIME_MS
            });
            // Establecer el timer
            ROOM_TIMERS[roomCode] = setTimeout(() => {
                setNextTurn(room, true);
            }, TURN_TIME_MS);

        } else {
            // B. NADIE MÁS TIENE QUE DAR PISTA (Fin de la ronda de pistas)
            room.status = 'VOTING';
            room.votes = []; // Asegúrate de que este array esté vacío.
            room.currentTurnIndex = -1;
            room.turnStartTime = null;
            // Guardamos el historial de pistas (¡Correcto!)
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

    // Es crucial que el impostor actual (el que tiene isImpostor: true) sea quien sepa la palabra clave.
    const impostorPlayer = alivePlayers.find(p => p.isImpostor);

    // Aquí, si usas la lógica de palabra secreta global, asegúrate de que room.secretWord esté actualizada
    // Si la palabra clave cambia por ronda, debe ser elegida ANTES de llegar aquí.

    room.status = 'GUESSING';
    room.currentRound += 1;

    clearRoomTimer(roomCode);

    room.currentTurnIndex = -1;
    room.turnStartTime = null;
    room.players.forEach(p => {
        p.clueGiven = null;
        p.vote = null;
        p.guessGiven = false;
    });
    room.votes = [];
    room.turnOrder = shuffleArray(alivePlayers.map(p => p.userId.toString()));

    // Necesitamos asegurarnos de que la palabra secreta esté establecida ANTES de guardar.
    // Asumiendo que room.secretWord ya está establecida y es la palabra clave.

    await room.save();

    // El error de "la palabra no se encuentra en la lista" se resuelve
    // enviando las palabras de la CATEGORÍA al frontend.
    const category = await Category.findById(room.categoryId);

    io.to(roomCode).emit('guessing_started', {
        ...getSafeRoomData(room),
        words: category.words, // ENVIAR LAS PALABRAS DE LA CATEGORÍA
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
    room.votes = [];
    room.impostorTarget = null; // Resetear el objetivo del impostor.
    await room.save();
    await setNextTurn(room);

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
