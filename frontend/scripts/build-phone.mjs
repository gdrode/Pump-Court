// Builds the phone camera page (pumpCourt/phone.html + pumpCourt/src/phone/main.ts)
// into ONE html file, dist/phone.html. The Rust app embeds it (backend/build.rs)
// and serves it to phones at https://<laptop>:47800/phone.html.
import { build } from "esbuild";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/phone.html"), html.replace(tag, () => `<script type="module">${js}</script>`));
console.log("[build-phone] wrote dist/phone.html");
