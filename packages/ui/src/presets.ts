import { createUIElement, emptyUI } from "./schema";
import type { UIDocument } from "./schema";
export function sampleHUD(): UIDocument {
  const ui = emptyUI(),
    panel = createUIElement("panel", "hud-panel", "HUD panel");
  Object.assign(panel, { anchor: "top-right", x: 24, y: 24, width: 300, height: 496 });
  panel.style.padding = 0;
  ui.elements.push(panel);
  const add = (
    kind: Parameters<typeof createUIElement>[0],
    id: string,
    text: string,
    y: number,
    height = 42,
  ) => {
    const e = createUIElement(kind, id, text);
    Object.assign(e, { parent: panel.id, x: 16, y, width: 268, height, text });
    ui.elements.push(e);
    return e;
  };
  add("text", "hud-title", "FIELD KIT", 12, 36).style.color = "#d8d1a7";
  add("text", "health-text", "Health: 75 / 100", 52, 34);
  add("progress", "health-bar", "Health", 94, 58).value = 75;
  add("button", "heal-button", "Use medkit", 162).action = "heal";
  const slider = add("slider", "power-slider", "Ability power", 214, 62);
  slider.value = 50;
  slider.action = "power";
  add("toggle", "shield-toggle", "Shield enabled", 286, 60).action = "shield";
  add("text", "status-text", "Press Play to try the UI", 356, 62).style.fontSize = 14;
  add("button", "pause-button", "Pause", 430).action = "pause";
  return ui;
}
export const UI_DEMO_SCRIPT = `import { Script, type Entity } from '@pinefall/sdk';
export default class HUDController extends Script {
  health = 75;
  start() {
    this.renderHealth();
    this.ctx.ui.onAction('pause', () => {
      this.ctx.engine.paused = !this.ctx.engine.paused;
      this.ctx.ui.setText('pause-button', this.ctx.engine.paused ? 'Resume' : 'Pause');
    });
    this.ctx.ui.onAction('heal', () => {
      this.health = Math.min(100, this.health + 10);
      this.renderHealth();
      this.ctx.ui.setText('status-text', 'Medkit used');
    });
    this.ctx.ui.on('power-slider', 'change', event => {
      this.ctx.ui.setText('status-text', 'Power: ' + event.value);
    });
    this.ctx.ui.on('shield-toggle', 'change', event => {
      this.ctx.ui.setText('status-text', event.value ? 'Shield on' : 'Shield off');
    });
  }
  update() {
    this.ctx.ui.setText('hud-title', 'FIELD KIT · ' + this.ctx.time.elapsed.toFixed(1) + 's');
  }
  trigger(other: Entity, started: boolean) {
    if (started && other.tag === 'hazard' && !this.ctx.ui.get('shield-toggle')?.value) {
      this.health = Math.max(0, this.health - 20);
      this.renderHealth();
      this.ctx.ui.setText('status-text', 'Hazard hit');
    }
  }
  renderHealth() {
    this.ctx.ui.setText('health-text', 'Health: ' + this.health + ' / 100');
    this.ctx.ui.setValue('health-bar', this.health);
    this.ctx.ui.setEnabled('heal-button', this.health < 100);
  }
}
`;
