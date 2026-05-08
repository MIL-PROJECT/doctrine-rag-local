/**
 * Remove `.next` so a stuck manifest (e.g. PageNotFoundError for /api routes) cannot break `next build`.
 */
const fs = require("fs");
const path = require("path");

const target = path.join(__dirname, "..", ".next");
try {
  fs.rmSync(target, { recursive: true, force: true });
  console.log("Removed .next");
} catch (e) {
  if (e && e.code !== "ENOENT") throw e;
}
