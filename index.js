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
import http from 'http'; // ¡Nuevo! Importar módulo HTTP
import { Server } from 'socket.io'; // ¡Nuevo! Importar Socket.IO Server
import { initSocketIO } from './src/socket/socketManager.js';
// import { handleSocketEvents } from './src/controllers/socket.controllers.js';
import './src/database/database.js'

const app = express();
const httpServer = http.createServer(app); // ¡Nuevo! Crear servidor HTTP a partir de la app Express
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

// --- Configuración de Socket.IO ---

const io = new Server(httpServer, {
  cors: {
    origin: "*", // Asegúrate de que coincida con el CORS de Express
    methods: ["GET", "POST"]
  }
});


const verifyJwt = (token) => {
  try {
    // Asegúrate de usar la misma clave secreta que usas para firmar tus tokens
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null; // Token inválido o expirado
  }
};

// Middleware para sockets
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    // Si no hay token, rechazar la conexión o continuar sin datos de usuario
    // console.log("Conexión de socket rechazada: No hay token.");
    return next(new Error("Authentication error: Token required."));
  }

  const decoded = verifyJwt(token);

  // console.log("Token decodificado:", decoded);

  if (decoded) {
    // **CORRECCIÓN AQUÍ:** Usamos las claves 'id' y 'name' que incluimos en el token
    socket.userId = decoded.id;   // Antes era decoded._id (incorrecto)
    socket.userName = decoded.name; // Antes era decoded.name (pero no existía)
    next(); // Continuar con la conexión
  } else {
    // Token inválido
    // console.log("Conexión de socket rechazada: Token inválido.");
    next(new Error("Authentication error: Invalid token."));
  }
});

// Llama a la función que maneja los eventos de conexión
initSocketIO(io);
// handleSocketEvents(io);

// ---------------------------------

// Inicializar el servidor HTTP (en lugar del app.listen de Express)
httpServer.listen(port, () => {
  console.log('Servidor corriendo en el puerto ' + port);
});

// ¡Nuevo! Exportar la instancia de IO para usarla en los controladores REST.
export { io };