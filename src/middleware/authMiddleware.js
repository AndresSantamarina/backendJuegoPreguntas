import jwt from "jsonwebtoken";
import User from "../database/model/User.js";

export const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.usuario = await User.findById(decoded.userId).select("-password");
      next();
    } catch (err) {
      return res.status(401).json({ message: "Token inválido" });
    }
  } else {
    return res.status(401).json({ message: "No token, autorización denegada" });
  }
};
