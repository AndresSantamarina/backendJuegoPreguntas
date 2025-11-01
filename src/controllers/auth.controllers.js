import User from "../database/model/User.js";
import jwt from "jsonwebtoken";

const generateToken = (user) => {
  return jwt.sign(
    // Firma el token con los datos que necesitará el socket
    { id: user._id, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );
};

export const register = async (req, res) => {
  const { name, password } = req.body;
  try {
    const userExist = await User.findOne({ name });
    if (userExist) return res.status(400).json({ message: "El usuario ya existe" });

    const newUser = await User.create({ name, password });
    const token = generateToken(newUser);
    res.status(201).json({ user: { id: newUser._id, name: newUser.name }, token });
  } catch (error) {
    res.status(500).json({ message: "Error al registrar usuario" });
  }
};

export const login = async (req, res) => {
  const { name, password } = req.body;
  try {
    const user = await User.findOne({ name });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    // console.log('--- OBJETO USUARIO ANTES DE GENERAR TOKEN ---');
    // console.log({
    //   _id: user._id,
    //   name: user.name
    // });
    // console.log('-------------------------------------------');
    const token = generateToken(user);
    res.status(200).json({ user: { id: user._id, name: user.name }, token });
  } catch (error) {
    res.status(500).json({ message: "Error en login" });
  }
};
