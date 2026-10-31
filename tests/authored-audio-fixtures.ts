import { animatedScene } from "./animator-fixtures";
import { sineWave } from "./audio-fixtures";
import { emptyAudio, defaultCue, waveURI } from "../packages/audio/src/definition";
export function audioDefinition() {
  const audio = emptyAudio();
  audio.assets.push({ id: "tone", name: "tone.wav", data: waveURI(sineWave(0.2)) });
  audio.cues.push(
    { ...defaultCue("foot", "tone"), spatial: true },
    { ...defaultCue("interface", "tone"), bus: "ui" },
    { ...defaultCue("loop", "tone"), loop: true },
  );
  return audio;
}
export async function audioScene() {
  const { scene, id } = await animatedScene();
  scene.name = "Authored audio fixture";
  scene.audio = audioDefinition();
  const actor = scene.entities.find((e) => e.id === id)!;
  actor.audioCues = { hit: "foot" };
  actor.animator!.initial = "attack";
  return { scene, id };
}
