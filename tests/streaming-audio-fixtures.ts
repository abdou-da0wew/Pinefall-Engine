import { emptyAudio, defaultCue, waveURI } from "../packages/audio/src/definition";
import { sineWave } from "./audio-fixtures";
export function streamingDefinition() {
  const audio = emptyAudio();
  audio.assets = [
    {
      id: "music",
      name: "original-music.wav",
      mode: "stream",
      data: waveURI(sineWave(31, 1, 8000)),
    },
  ];
  audio.cues = [
    { ...defaultCue("music", "music"), bus: "music", loop: true, persistent: true },
    { ...defaultCue("scene-music", "music"), bus: "music", loop: true },
  ];
  return audio;
}
