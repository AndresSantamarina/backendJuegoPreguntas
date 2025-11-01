import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import path from 'path';
import jwt from 'jsonwebtoken';
import preguntasRouter from './src/routes/preguntas.routes.js';
import authRouter from "./src/routes/auth.routes.js"
import roomRouter from "./src/routes/room.routes.js"
import http from 'http';
import { Server } from 'socket.io';
import { initSocketIO } from './src/socket/socketManager.js';
import './src/database/database.js'

const app = express();
const httpServer = http.createServer(app);
const port = process.env.PORT || 4000;

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

app.use(morgan('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
app.use(express.static(path.join(__dirname, '/public')))


app.use('/api', authRouter)
app.use('/api/preguntas', preguntasRouter)
app.use('/api/impostor', roomRouter)

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});


const verifyJwt = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("Authentication error: Token required."));
  }

  const decoded = verifyJwt(token);

  if (decoded) {
    socket.userId = decoded.id;
    socket.userName = decoded.name;
    next();
  } else {
    next(new Error("Authentication error: Invalid token."));
  }
});

initSocketIO(io);

httpServer.listen(port, () => {
  console.log('Servidor corriendo en el puerto ' + port);
});

export { io };