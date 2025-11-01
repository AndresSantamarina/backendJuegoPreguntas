import { registerImpostorHandlers } from './impostorHandlers.js';
import { registerConnectionHandlers } from './connectionHandlers.js';
import { registerClueHandlers } from "./clueHandlers.js"
import { registerGuessHandlers } from './guessHandlers.js';
import { registerLobbyHandlers } from './lobbyHandlers.js';
import { registerVotingHandlers } from "./votingHandlers.js"

export const registerGameHandlers = (socket, io) => {
    const userId = socket.userId;
    const userName = socket.userName;

    registerImpostorHandlers(socket, io, userId, userName);
    registerConnectionHandlers(socket, io, userId, userName);
    registerLobbyHandlers(socket, io, userId, userName);
    registerVotingHandlers(socket, io, userId, userName);
    registerClueHandlers(socket, io, userId, userName);
    registerGuessHandlers(socket, io, userId, userName);
};
