import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const bundled = ["drizzle-orm", "express", "pg"];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });
  const pkg = JSON.parse(await readFile(path.resolve(__dirname, "package.json"), "utf-8"));
  const allDeps = [...Object.keys(pkg.dependencies || {}), ...Object.keys(pkg.devDependencies || {})];
  const externals = allDeps.filter((dep) => !bundled.includes(dep) && !pkg.dependencies?.[dep]?.startsWith("workspace:"));

  await esbuild({
    entryPoints: { index: path.resolve(__dirname, "src/index.ts") },
    platform: "node",
    bundle: true,
    format: "cjs",
    outdir: distDir,
    outExtension: { ".js": ".cjs" },
    define: {
      "process.env.NODE_ENV": '"production"',
      "import.meta.url": "__importMetaUrl",
    },
    banner: { js: 'const __importMetaUrl = require("url").pathToFileURL(__filename).href;' },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
