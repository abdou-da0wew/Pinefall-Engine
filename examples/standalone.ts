import { Engine, LOW, HIGH, parseScene } from "../packages/runtime/src";
import type { Template } from "../packages/runtime/src";
import { createTemplate } from "./templates";
const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#14291e;color:#e3e4ca;font:13px system-ui}canvas{width:100vw;height:100vh;display:block}aside{position:absolute;top:20px;left:20px;padding:20px;background:#10251ee6;border:1px solid #74856855;border-radius:8px;max-width:360px}h1{font-weight:500}button,select,label{font:12px system-ui;padding:8px;background:#344b33;color:#e5e4c8;border:1px solid #647455;border-radius:4px;cursor:pointer}p{line-height:1.8;font-size:12px;color:#b3c5a9}#error{color:#ffbca2;white-space:pre-wrap}small{letter-spacing:2px;color:#b0ba8a}`;
document.head.append(style);
document.body.innerHTML =
  '<canvas tabindex="0" aria-label="Game viewport"></canvas><aside><small>PINEFALL / STANDALONE PLAYER</small><h1 id="title"></h1><p id="score">Loading physics…</p><p>WASD move/drive · Space jump/brake · Shift sprint · drag look · R recover · Escape pause. Sandbox: drag orbit.</p><button id="pause">Pause / resume</button> <button id="restart">Restart</button><p><select id="quality"><option value="low">Low / CEDAR</option><option value="high">High / FX</option></select> <label>Load scene<input hidden id="file" type="file" accept=".json"></label></p><div id="sandbox" hidden><button id="spawn">Spawn crate</button> <button id="impulse">Impulse</button></div><p id="stats"></p><p id="error"></p></aside>';
const $ = (id: string) => document.getElementById(id)!;
async function main() {
  let runtime: Engine;
  runtime = await Engine.create(document.querySelector("canvas")!, {
    onStats: (s) => {
      $("stats").textContent =
        `${Math.round(s.fps)} FPS · ${s.drawCalls} draws · ${s.width} × ${s.height}`;
      $("score").textContent = runtime.paused
        ? "Paused"
        : runtime.won
          ? "Signal restored!"
          : `${runtime.collected.size} / ${runtime.goalCount} signals`;
    },
  });
  runtime.events.subscribe((e) => {
    if (e.type === "error") $("error").textContent = e.message;
  });
  const query = new URLSearchParams(location.search).get("template");
  const template = (
    ["adventure", "first-person", "driving", "sandbox"].includes(query || "") ? query : "adventure"
  ) as Template;
  let authored = createTemplate(template);
  async function load() {
    await runtime.load(authored);
    $("title").textContent = authored.name;
    $("sandbox").hidden = authored.template !== "sandbox";
    runtime.play();
  }
  await load();
  $("pause").onclick = () => {
    runtime.paused = !runtime.paused;
  };
  $("restart").onclick = () => void load();
  $("spawn").onclick = () => runtime.spawnBox();
  $("impulse").onclick = () => runtime.impulse();
  $("quality").onchange = (e) =>
    runtime.applySettings((e.target as HTMLSelectElement).value === "high" ? HIGH : LOW);
  $("file").onchange = async (e) => {
    try {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 9_000_000) throw Error("Scene too large");
      authored = parseScene(JSON.parse(await file.text()));
      await load();
    } catch (error) {
      $("error").textContent = String(error);
    }
  };
  window.addEventListener("pagehide", () => runtime.dispose(), { once: true });
}
void main().catch((e) => {
  $("error").textContent = "WebGL 2 required. " + String(e);
});
