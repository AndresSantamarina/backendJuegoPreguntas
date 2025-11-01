import mongoose, { Schema } from "mongoose";

const playerSchema = new Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true },
    lives: { type: Number, default: 3 },
    isImpostor: { type: Boolean, default: false },
    isAlive: { type: Boolean, default: true },
    clueGiven: { type: String, default: null },
    vote: { type: String, default: null },
    guessGiven: { type: Boolean, default: false }
}, { _id: false });

const roomSchema = new Schema({
    roomId: {
        type: String,
        required: true,
        unique: true,
        uppercase: true
    },
    status: {
        type: String,
        enum: ['LOBBY', 'IN_GAME', 'VOTING', 'IMPOSTOR_CHOOSING', 'GUESSING', 'IMPOSTOR_GUESSING' , 'FINISHED'],
        default: 'LOBBY'
    },
    players: {
        type: [playerSchema],
        validate: [val => val.length <= 4, 'La sala está limitada a 4 jugadores']
    },
    hostId: { type: String, required: true },
    currentRound: { type: Number, default: 0 },
    maxPlayers: { type: Number, default: 4 },

    categoryId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'category',
        required: true
    },
    words: {
        type: [String],
        default: []
    },
    secretWord: { type: String, default: null },
    impostorId: { type: String, default: null },

    turnOrder: { type: [String], default: [] },
    currentTurnIndex: { type: Number, default: 0 },
    turnStartTime: { type: Date, default: null },
    turnTimers: { type: [Object], default: [] },

    votes: [{
        voterId: String,
        targetId: String
    }],

    impostorTarget: { type: String, default: null },

    roundHistory: [{
        round: Number,
        clues: [{
            userId: String,
            clue: String
        }]
    }]
}, { timestamps: true });


const Room = mongoose.model('room', roomSchema);

export default Room