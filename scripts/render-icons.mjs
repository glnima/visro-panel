// Renders scripts/icon.svg to the PNG sizes the manifest and Apple devices need,
// using headless Chrome (no image libraries). Run: node scripts/render-icons.mjs
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const svg = readFileSync(new URL("./icon.svg", import.meta.url), "utf8");
// [file, size, padding fraction] — "any" icons get rounded corners, maskable ones stay full-bleed
const outputs = [
  ["public/icons/icon-192.png", 192, "round"],
  ["public/icons/icon-512.png", 512, "round"],
  ["public/icons/maskable-512.png", 512, "full"],
  ["public/icons/apple-touch-icon.png", 180, "full"],
  ["src/app/icon.png", 64, "round"],
];

const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--remote-debugging-port=9399", "--user-data-dir=/tmp/mizan-icons", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 40 && !targets?.length; i++) { try { targets = await (await fetch("http://127.0.0.1:9399/json")).json(); } catch { await sleep(250); } }
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); pending.delete(m.id); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

for (const [file, size, shape] of outputs) {
  const radius = shape === "round" ? Math.round(size * 0.22) : 0;
  const html = `<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;border-radius:${radius}px;overflow:hidden">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div></body></html>`;
  await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  await send("Page.navigate", { url: "data:text/html;base64," + Buffer.from(html).toString("base64") });
  await sleep(400);
  const { result } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  writeFileSync(file, Buffer.from(result.data, "base64"));
  console.log("wrote", file);
}
ws.close(); chrome.kill();
