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

function tokenFromRequest(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function verifyToken(token, res) {
  if (!token) {
    res.status(401).json({ error: "Connexion requise." });
    return null;
  }

  try {
    return jwt.verify(token, secret, { issuer: "pixel-everywhere" });
  } catch {
    res.status(401).json({ error: "Session expirée ou invalide." });
    return null;
  }
}

function readToken(req, res, kind) {
  const payload = verifyToken(tokenFromRequest(req), res);
  if (!payload) return null;
  if (payload.kind !== kind) {
    res.status(401).json({ error: "Cette session ne correspond pas à cet espace." });
    return null;
  }
  return payload;
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

export function authenticateAny(req, res, next) {
  const payload = verifyToken(tokenFromRequest(req), res);
  if (!payload) return;
  if (payload.kind !== "member" && payload.kind !== "staff") {
    return res.status(401).json({ error: "Cette session ne correspond à aucun compte Pixel Everywhere." });
  }
  req.identity = payload;
  if (payload.kind === "staff") req.staff = payload;
  else req.member = payload;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis." });
  }
  next();
}
