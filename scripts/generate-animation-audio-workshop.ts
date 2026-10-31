import { animationAudioTutorial } from "../examples/animation-audio-lab";
import { packProject } from "../packages/project/src/pif";
import { atomicWrite } from "../packages/project/src/atomic-file";
const path = "examples/projects/animation-audio-workshop.pif";
await atomicWrite(path, await packProject(await animationAudioTutorial()));
console.log("Generated original procedural workshop: " + path);
