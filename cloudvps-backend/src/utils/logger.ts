import { mkdir, appendFile } from "fs/promises";
import { join } from "path";

const timestamp = () => new Date().toISOString();

// Returns logs/YYYY-MM-DD based on current UTC date.
const getLogDir = () => {
  const date = new Date().toISOString().slice(0, 10);
  return join(process.cwd(), "logs", date);
};

// Fire-and-forget file write. Never throws — stdout already has the entry.
const writeFile = (filename: string, entry: object): void => {
  const dir = getLogDir();
  mkdir(dir, { recursive: true })
    .then(() => appendFile(join(dir, filename), JSON.stringify(entry) + "\n"))
    .catch(() => {});
};

export const logger = {
  info: (msg: string, meta?: object) => {
    const entry = { level: "info", ts: timestamp(), msg, ...meta };
    console.log(JSON.stringify(entry));
    writeFile("app.log", entry);
  },

  warn: (msg: string, meta?: object) => {
    const entry = { level: "warn", ts: timestamp(), msg, ...meta };
    console.warn(JSON.stringify(entry));
    writeFile("app.log", entry);
  },

  error: (msg: string, meta?: object) => {
    const entry = { level: "error", ts: timestamp(), msg, ...meta };
    console.error(JSON.stringify(entry));
    // Errors go to both app.log and a dedicated error.log for quick filtering.
    writeFile("app.log", entry);
    writeFile("error.log", entry);
  },

  auth: (event: string, meta?: object) => {
    const entry = { level: "info", ts: timestamp(), module: "auth", event, ...meta };
    console.log(JSON.stringify(entry));
    writeFile("auth.log", entry);
  },

  payment: (event: string, meta?: object) => {
    const entry = { level: "info", ts: timestamp(), module: "payment", event, ...meta };
    console.log(JSON.stringify(entry));
    writeFile("payment.log", entry);
  },

  vps: (event: string, meta?: object) => {
    const entry = { level: "info", ts: timestamp(), module: "vps", event, ...meta };
    console.log(JSON.stringify(entry));
    writeFile("vps.log", entry);
  },

  admin: (event: string, meta?: object) => {
    const entry = { level: "info", ts: timestamp(), module: "admin", event, ...meta };
    console.log(JSON.stringify(entry));
    writeFile("admin.log", entry);
  },
};
