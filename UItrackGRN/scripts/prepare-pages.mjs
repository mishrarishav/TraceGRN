import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputDirectory = resolve("dist/client");
const fallbackPage = resolve(outputDirectory, "404.html");
const staticRoutes = [
  "login",
  "import",
  "grns",
  "materials",
  "vendors",
  "labels",
  "inward",
  "issue",
  "inventory",
  "traceability",
  "reports",
  "import-history",
  "revisions",
  "users",
  "stations",
  "configuration",
  "audit",
];

await access(fallbackPage);
await copyFile(fallbackPage, resolve(outputDirectory, "index.html"));
await Promise.all(
  staticRoutes.map(async (route) => {
    const routeDirectory = resolve(outputDirectory, route);
    await mkdir(routeDirectory, { recursive: true });
    await copyFile(fallbackPage, resolve(routeDirectory, "index.html"));
  }),
);
await writeFile(resolve(outputDirectory, ".nojekyll"), "");

console.log(
  `Prepared dist/client for GitHub Pages deployment with ${staticRoutes.length} direct routes.`,
);
