import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(serverDirectory, "index.mjs");
const runtimePath = path.join(serverDirectory, "index.runtime.mjs");

let source = fs.readFileSync(sourcePath, "utf8");

if (!source.includes('from "./suggestions.mjs"')) {
  source = source.replace(
    'import "dotenv/config";',
    'import "dotenv/config";\nimport { registerSuggestionRoutes } from "./suggestions.mjs";'
  );
}

const registration = `registerSuggestionRoutes({
  app,
  db,
  authenticate,
  authenticateMember,
  requireActiveStaff,
  requireActiveMember,
  staffOnly
});

`;

if (!source.includes("registerSuggestionRoutes({")) {
  source = source.replace(
    'if (process.env.NODE_ENV === "production") {',
    `${registration}if (process.env.NODE_ENV === "production") {`
  );
}

fs.writeFileSync(runtimePath, source);
await import(`${pathToFileURL(runtimePath).href}?v=${Date.now()}`);
