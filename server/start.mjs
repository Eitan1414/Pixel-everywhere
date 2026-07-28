import "dotenv/config";

const defaultOrigins = [
  "http://localhost",
  "https://localhost",
  "capacitor://localhost"
];

const configuredOrigins = (process.env.MOBILE_ORIGINS || defaultOrigins.join(","))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Une application Electron empaquetée est chargée depuis file://. Les navigateurs
// sérialisent alors son origine opaque sous la valeur littérale "null" lors des
// requêtes CORS vers le serveur HTTPS/ngrok.
if (!configuredOrigins.includes("null")) {
  configuredOrigins.push("null");
}

process.env.MOBILE_ORIGINS = [...new Set(configuredOrigins)].join(",");

await import("./index.mjs");
