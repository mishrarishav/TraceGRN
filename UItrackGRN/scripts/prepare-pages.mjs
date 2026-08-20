import { access, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve("dist/client");
const fallbackPage = resolve(outputDirectory, "404.html");

await access(fallbackPage);
await copyFile(fallbackPage, resolve(outputDirectory, "index.html"));
await writeFile(resolve(outputDirectory, ".nojekyll"), "");

console.log("Prepared dist/client for GitHub Pages deployment.");
