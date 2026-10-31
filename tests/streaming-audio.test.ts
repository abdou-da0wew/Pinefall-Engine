import { test, expect } from "bun:test";
import { streamingDefinition } from "./streaming-audio-fixtures";
import { AudioCatalog, AudioService } from "../packages/audio/src/service";
import { NullAudioBackend } from "../packages/audio/src/null";
import { parseAudio, emptyAudio, waveBytes } from "../packages/audio/src/definition";
import { inspectWave } from "../packages/audio/src/wav";
import { assetMemory } from "../packages/assets/src/budget";
import { packProject, unpackProject } from "../packages/project/src/pif";
import { createGame } from "../packages/project/src";
const prepare = (definition = streamingDefinition()) =>
  AudioCatalog.prepare(definition, new AbortController().signal);
test("long streams reject effects decoding and survive PIF with explicit persistence", async () => {
  const definition = streamingDefinition(),
    bytes = waveBytes(definition.assets[0].data);
  expect(() => inspectWave(bytes)).toThrow();
  expect(inspectWave(bytes, true).duration).toBe(31);
  const scene = createGame("Streaming");
  scene.version = 3;
  scene.audio = definition;
  expect((await unpackProject(await packProject(scene))).audio).toEqual(definition);
  const bad = structuredClone(definition);
  delete bad.assets[0].mode;
  expect(() => parseAudio(bad)).toThrow();
  const spatial = structuredClone(definition);
  spatial.cues[0].spatial = true;
  expect(() => parseAudio(spatial)).toThrow();
});
test("persistent music survives adoption and entity disposal but explicit reset releases it", async () => {
  const before = assetMemory.snapshot.used,
    service = new AudioService(new NullAudioBackend());
  try {
    service.adopt(await prepare());
    await service.settled();
    const music = service.play("music", "scope"),
      scene = service.play("scene-music", "scope");
    expect(music.status).toBe("not-rendered");
    expect(scene.status).toBe("not-rendered");
    expect(service.play("scene-music").status).toBe("rejected");
    expect(service.play("music", "scope")).toEqual(music);
    service.stopOwner("scope");
    expect(service.stats.active).toBe(1);
    service.setPaused(true);
    expect(service.play("scene-music").status).toBe("blocked");
    if (!("handle" in music)) throw Error("Missing handle");
    for (let i = 0; i < 100; i++) service.seek(music.handle, i % 30, "scope");
    expect(() => service.seek(music.handle, 32, "scope")).toThrow();
    service.adopt(await prepare(emptyAudio()));
    await service.settled();
    expect(service.voices.has(music.handle)).toBe(true);
    service.advance(60);
    expect(service.voices.has(music.handle)).toBe(true);
    service.reset();
    expect(service.stats.active).toBe(0);
  } finally {
    await service.dispose();
  }
  expect(assetMemory.snapshot.used).toBe(before);
});
