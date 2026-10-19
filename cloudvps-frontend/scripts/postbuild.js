import { cpSync, existsSync } from "fs"

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true })
if (existsSync("public")) {
  cpSync("public", ".next/standalone/public", { recursive: true })
}
console.log("Static files copied to standalone.")
