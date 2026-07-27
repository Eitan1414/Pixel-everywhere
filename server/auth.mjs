import jwt from "jsonwebtoken";

const isProduction = process.env.NODE_ENV === "production";
const jwtSecret = process.env.JWT_SECRET;

if (isProduction && (!jwtSecret || jwtSecret.length < 32)) {
  throw new Error("JWT_SECRET doit contenir au moins 32 caractères en production.");
}

const secret = jwtSecret || "development-only-secret-do-not-use-in-production";

export function createToken(user, kind = "staff") {
  return jwt.sign(
    { sub: String(user.id), username: user.username, role: user.role, kind },
    secret,
    { expiresIn: "8h", issuer: "pixel-everywhere" }
  );
}

function readToken(req, res, kind) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!token) {
    res.status(401).json({ error: "Connexion requise." });
    return null;
  }

  try {
    const payload = jwt.verify(token, secret, { issuer: "pixel-everywhere" });
    if (payload.kind !== kind) {
      res.status(401).json({ error: "Cette session ne correspond pas à cet espace." });
      return null;
    }
    return payload;
  } catch {
    res.status(401).json({ error: "Session expirée ou invalide." });
    return null;
  }
}

export function authenticate(req, res, next) {
  const payload = readToken(req, res, "staff");
  if (!payload) return;
  req.staff = payload;
  next();
}

export function authenticateMember(req, res, next) {
  const payload = readToken(req, res, "member");
  if (!payload) return;
  req.member = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis." });
  }
  next();
}
