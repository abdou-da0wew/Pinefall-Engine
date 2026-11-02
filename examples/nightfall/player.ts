import { Engine, LOW, HIGH } from "../../packages/runtime/src";
import { projectJob } from "../../packages/project/src/pif-client";
const style = document.createElement("style");
style.textContent = `*{box-sizing:border-box}body{margin:0;background:#08161d;color:#e5dcc4;font:15px system-ui,sans-serif}canvas{display:block;width:100vw;height:100vh;outline:none}#menu{position:fixed;inset:0;z-index:30;display:flex;align-items:center;padding:7vw;background:linear-gradient(90deg,#061318f5,#061318b5 50%,#06131845)}#menu[hidden]{display:none}.content{max-width:600px}.eyebrow{color:#a8b6a7;letter-spacing:5px;font-size:11px}.rule{width:54px;height:2px;background:#bd9861;margin:30px 0}h1{font:clamp(52px,7vw,94px)/.95 Georgia,serif;font-weight:400;letter-spacing:-3px;margin:30px 0}h1 span{color:#b79b71}p{line-height:1.8;color:#acb9b2;max-width:450px}.controls{font-size:12px;color:#92a79f;line-height:2;margin:26px 0}button,select{font:inherit;color:#e5dcc4;background:#1b3438;border:1px solid #638078;border-radius:2px;padding:13px 22px;cursor:pointer}button:hover{background:#2c4849}button:disabled{opacity:.4;cursor:wait}#start{background:#bc9a66;color:#111e21;border:0;min-width:220px;font-weight:600;letter-spacing:2px;font-size:12px;padding:19px}label{font-size:12px;display:inline-flex;align-items:center;gap:9px;margin:18px 18px 0 0}select{font-size:12px;padding:9px}.fine{font-size:11px;max-width:470px;color:#7e948c}#error{color:#ffad90;white-space:pre-wrap}#menu-toggle{position:fixed;right:25px;top:78px;z-index:20;padding:6px 12px;font-size:11px;background:#0b202bb0}#telemetry{position:fixed;right:25px;bottom:12px;color:#74958d;font:10px monospace;z-index:20;pointer-events:none}#fullscreen{background:transparent;margin-left:10px;font-size:12px}.corner{position:fixed;right:35px;bottom:35px;letter-spacing:3px;font-size:10px;color:#6d8a83}@media(max-width:700px){#menu{padding:24px}.controls{font-size:11px}h1{margin:20px 0}.rule{margin:20px 0}.corner{display:none}}`;
document.head.append(style);
document.body.innerHTML = `<canvas tabindex="0" aria-label="Nightfall Keep game viewport"></canvas><button type="button" id="menu-toggle" hidden>ESC / MENU</button><div id="telemetry"></div><section id="menu" aria-label="Game menu"><div class="content"><div class="eyebrow">PINEFALL ENGINE / ORIGINAL GAME</div><div class="rule"></div><h1>Nightfall<br><span>Keep.</span></h1><p id="description">The bells have stopped. Something beyond the trees has not.<br>Hold the gate. Search the ruins. Survive the next wave.</p><div class="controls">WASD move · Mouse aim / fire · Shift sprint<br>R reload · 1 / 2 weapons · E supplies · F flashlight · Esc pause<br>Click the world to capture the mouse. Drag-to-look fallback.</div><button type="button" id="start" disabled>PREPARING THE WOODS…</button><button type="button" id="fullscreen">Full screen ↗</button><div><label>Rendering<select id="quality"><option value="low">Low / 540p</option><option value="high">High / shadows + FX</option></select></label><label><input id="sound" type="checkbox" checked>Sound</label></div><p class="fine" id="trust">Entering runs the original Nightfall Keep TypeScript game scripts and unlocks audio. Survival horror, gunfire and sudden enemy attacks. No external downloads or account required.</p><p id="error" role="alert"></p></div><div class="corner"><a href="./index.html" style="color:inherit">PINEFALL EDITOR ↗</a> / THE LAST WATCH</div></section>`;
if (document.body.dataset.standalone) document.querySelector(".corner a")?.remove();
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
async function main() {
  const canvas = document.querySelector("canvas")!,
    menu = element("menu"),
    start = element<HTMLButtonElement>("start");
  let playing = false;
  const runtime = await Engine.create(canvas, {
    onStats: (stats) => {
      element("telemetry").textContent =
        `${Math.round(stats.fps)} FPS / ${stats.drawCalls} DRAWS / ${stats.width} × ${stats.height}`;
      if (playing) menu.hidden = !runtime.paused;
      if (playing && runtime.paused) {
        menu.hidden = false;
        start.textContent = "RESUME THE WATCH";
      }
    },
  });
  if (import.meta.env.DEV) (window as Window & { nightfall?: Engine }).nightfall = runtime;
  runtime.events.subscribe((event) => {
    if (event.type === "error")
      element("error").textContent = event.message + " " + JSON.stringify(event.data ?? {});
  });
  const response = await fetch("./Nightfall-Keep.pif");
  if (!response.ok)
    throw Error("Nightfall project missing. Run bun scripts/generate-nightfall.ts first.");
  const scene = await projectJob("unpack", new Uint8Array(await response.arrayBuffer()));
  await runtime.load(scene);
  const quality = (high: boolean) =>
    runtime.applySettings({
      ...(high ? HIGH : LOW),
      viewDistance: 100,
      volumetrics: false,
      exposure: 1.15,
      previewPost: { ...scene.graphics!.post!, enabled: high, bloom: high },
    });
  quality(false);
  start.disabled = false;
  start.textContent = "ENTER THE KEEP";
  const mute = () => {
    const enabled = element<HTMLInputElement>("sound").checked;
    runtime.audio.setBusGain("effects", enabled ? 0 : -60);
    runtime.audio.setBusGain("music", enabled ? 0 : -60);
  };
  start.onclick = () => {
    start.disabled = true;
    void runtime.audio
      .unlock()
      .then(() => {
        mute();
        if (!playing) {
          runtime.allowSceneScripts = true;
          runtime.play();
          playing = true;
        }
        runtime.paused = false;
        menu.hidden = true;
        element("menu-toggle").hidden = false;
        canvas.focus();
      })
      .catch((error) => {
        element("error").textContent = String(error);
      })
      .finally(() => {
        start.disabled = false;
      });
  };
  element("menu-toggle").onclick = () => {
    runtime.paused = true;
    runtime.input.clear();
    if (document.pointerLockElement) document.exitPointerLock();
    menu.hidden = false;
    start.textContent = "RESUME THE WATCH";
  };
  element<HTMLSelectElement>("quality").onchange = () =>
    quality(element<HTMLSelectElement>("quality").value === "high");
  element("sound").onchange = mute;
  element("fullscreen").onclick = () => {
    void (
      document.fullscreenElement
        ? document.exitFullscreen()
        : document.documentElement.requestFullscreen()
    ).catch((error) => {
      element("error").textContent = "Full screen unavailable: " + String(error);
    });
  };
  window.addEventListener("pagehide", () => runtime.dispose(), { once: true });
}
void main().catch((error) => {
  element("error").textContent = String(error);
});
