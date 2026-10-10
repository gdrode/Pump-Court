// Builds the phone camera page (pumpCourt/phone.html + pumpCourt/src/phone/main.ts)
// into ONE html file, dist/phone.html. The Rust app embeds it (backend/build.rs)
// and serves it to phones at https://<laptop>:47800/phone.html.
//
// The page gets the app's look, so the phone feels like the same game: the
// font (inlined), tokens.css + styles.css, the sketch-border SVG filters and
// the dragon host (rendered once here from ui/components, in three moods).
import { build } from "esbuild";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const team = join(root, "../pumpCourt");

const out = await build({
  entryPoints: [join(team, "src/phone/main.ts")],
  bundle: true,
  format: "esm",
  minify: true,
  target: ["safari15", "chrome100"],
  write: false,
});
// "</script" inside the code would end the inline script early.
const js = out.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");

const html = readFileSync(join(team, "phone.html"), "utf8");
const tag = /<script type="module" src="\/src\/phone\/main\.ts"><\/script>/;
if (!tag.test(html)) throw new Error("pumpCourt/phone.html no longer loads /src/phone/main.ts; update scripts/build-phone.mjs");

// --- The app's look ---------------------------------------------------------------
const font = readFileSync(join(root, "node_modules/@fontsource/patrick-hand/files/patrick-hand-latin-400-normal.woff2")).toString("base64");
const css = [
  `@font-face { font-family: 'Patrick Hand'; font-style: normal; font-weight: 400; font-display: swap; src: url(data:font/woff2;base64,${font}) format('woff2'); }`,
  readFileSync(join(root, "src/theme/tokens.css"), "utf8"),
  readFileSync(join(root, "src/theme/styles.css"), "utf8"),
].join("\n");

// Render the dragon and the SVG filters to plain markup with React, once.
const art = await build({
  stdin: {
    contents: `
      import { renderToStaticMarkup } from "react-dom/server";
      import { Dragon } from "./src/ui/components/Dragon";
      import { SketchDefs } from "./src/ui/components/SketchDefs";
      const svg = (action) => renderToStaticMarkup(<Dragon action={action} size="sm" />);
      export const defs = renderToStaticMarkup(<SketchDefs />);
      export const dragons = { wave: svg("wave"), cheer: svg("cheer"), sad: svg("sad") };
    `,
    loader: "tsx",
    resolveDir: root,
  },
  bundle: true,
  format: "esm",
  platform: "node",
  packages: "external", // react, react-dom: loaded from node_modules
  jsx: "automatic",
  write: false,
});
// Inside the project, so `react` resolves from its node_modules.
const tmp = mkdtempSync(join(root, "node_modules", ".phone-art-"));
const artFile = join(tmp, "art.mjs");
writeFileSync(artFile, art.outputFiles[0].text);
const { defs, dragons } = await import(pathToFileURL(artFile).href).finally(() => rmSync(tmp, { recursive: true, force: true }));

// Just the <svg>: the page has its own host box (div.host) around it.
for (const action of Object.keys(dragons)) dragons[action] = dragons[action].slice(dragons[action].indexOf("<svg"), dragons[action].lastIndexOf("</svg>") + 6);
const templates = Object.entries(dragons)
  .map(([action, svg]) => `<template id="dragon-${action}">${svg}</template>`)
  .join("");
let page = html
  .replace("<!-- app-style -->", () => `<style>${css}</style>`)
  .replace("<!-- app-defs -->", () => defs + templates)
  .replace(/data-host="(wave|cheer|sad)">/g, (m, action) => `${m}${dragons[action]}`);
if (!page.includes("dragon-wave") || !page.includes("@font-face")) throw new Error("pumpCourt/phone.html lost its <!-- app-style --> / <!-- app-defs --> markers");

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/phone.html"), page.replace(tag, () => `<script type="module">${js}</script>`));
console.log("[build-phone] wrote dist/phone.html");
