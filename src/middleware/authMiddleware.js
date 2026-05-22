import jwt from "jsonwebtoken";
import User from "../database/model/User.js";

export const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const id = decoded.userId || decoded.id || decoded._id;
      req.usuario = await User.findById(id).select("-password");
      if (!req.usuario) {
        return res.status(401).json({ message: "El usuario asociado a este token ya no existe" });
      }

      next();
    } catch (err) {
      console.error("Error en protect middleware:", err.message);
      return res.status(401).json({ message: "Token inválido o expirado" });
    }
  } else {
    return res.status(401).json({ message: "No hay token, autorización denegada" });
  }
};