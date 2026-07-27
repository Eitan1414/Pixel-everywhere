import jwt from "jsonwebtoken";

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET doit contenir au moins 32 caractères en production.");
}

const secret = jwtSecret || "development-only-secret-do-not-use-in-production";

export function createToken(user) {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role },
    secret,
    { expiresIn: "8h", issuer: "pixel-everywhere" }
  );
}

export function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    return res.status(401).json({ error: "Connexion requise." });
  }

  try {
    req.staff = jwt.verify(token, secret, { issuer: "pixel-everywhere" });
    next();
  } catch {
    res.status(401).json({ error: "Session expirée ou invalide." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis." });
  }
  next();
}

