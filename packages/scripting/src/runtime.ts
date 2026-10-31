import type { UIAPI, UIEvent } from "../../ui/src/store";
import * as THREE from "three";
import * as SDK from "./sdk";
import { compileScript } from "./compiler";
import { safeBehavior } from "../../runtime/src/behavior-safety";
import type { Behavior, BehaviorFactory, SimulationHost } from "../../runtime/src/behaviors";
import type { Entity, SceneDocument, ScriptAsset, ScriptValue } from "../../runtime/src/schema";
import type { ScriptContext } from "./sdk";
interface ScriptModule {
  default: SDK.GameScriptFactory | (new (ctx: ScriptContext) => Behavior);
  defaults?: Record<string, ScriptValue>;
}
export function hasSceneScripts(scene: SceneDocument) {
  return scene.entities.some((e) => e.enabled && e.scripts?.some((a) => a.enabled));
}
function evaluate(asset: ScriptAsset, resolveModule: (name: string) => ScriptModule): ScriptModule {
  const module: { exports: unknown } = { exports: {} };
  const require = (name: string) => {
    if (name === "@pinefall/sdk") return SDK;
    if (name === "three") return THREE;
    if (name.startsWith("./") || name.startsWith("@game/"))
      return resolveModule(name.replace(/^(\.\/|@game\/)/, ""));
    throw Error(
      "Unsupported import " + name + ". Use @pinefall/sdk, three, or ./Helper.ts scene modules.",
    );
  };
  // TRUSTED CODE ONLY: same privileges as host JS; this import resolver is not a sandbox.
  new Function(
    "module",
    "exports",
    "require",
    compileScript(asset.source, asset.name) +
      "\n//# sourceURL=pinefall-script/" +
      encodeURIComponent(asset.name),
  )(module, module.exports, require);
  const result = module.exports as ScriptModule;

  return result;
}
/** Build a fresh module cache and fresh instances per Play, never during scene import. */
export function createBehaviorSession(
  host: SimulationHost,
  registry: Map<string, BehaviorFactory>,
  allowScripts: boolean,
) {
  if (hasSceneScripts(host.document) && !allowScripts)
    throw Error("Scene scripts require explicit trusted-code permission");
  const modules = new Map<string, ScriptModule | Error>();
  const loading = new Set<string>();
  function load(asset: ScriptAsset): ScriptModule | Error {
    const cached = modules.get(asset.id);
    if (cached) return cached;
    if (loading.has(asset.id))
      return new Error("Circular scene-script imports are unsupported: " + asset.name);
    loading.add(asset.id);
    try {
      const module = evaluate(asset, (name) => {
        const matches =
          host.document.scripts?.filter((s) => s.name === name || s.name === name + ".ts") || [];
        if (matches.length !== 1) throw Error("Missing or ambiguous script module: " + name);
        const result = load(matches[0]);
        if (result instanceof Error) throw result;
        return result;
      });
      modules.set(asset.id, module);
      return module;
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error));
      modules.set(asset.id, failure);
      return failure;
    } finally {
      loading.delete(asset.id);
    }
  }
  return (entity: Entity): Behavior => {
    const instances: Behavior[] = [];
    const report = (script: string, hook: string, error: unknown) =>
      host.events.emit("error", "Behavior disabled after exception", {
        entity: entity.id,
        script,
        hook,
        error: (error instanceof Error ? error.stack || error.message : String(error)).slice(
          0,
          1500,
        ),
      });
    if (entity.behavior) {
      const factory = registry.get(entity.behavior);
      if (factory)
        instances.push(
          safeBehavior(factory, { engine: host, entity }, (hook, error) =>
            report(entity.behavior!, hook, error),
          ),
        );
      else
        host.events.emit("warning", "Unregistered behavior: " + entity.behavior, {
          entity: entity.id,
        });
    }
    for (const attachment of entity.scripts || []) {
      if (!attachment.enabled) continue;
      const asset = host.document.scripts?.find((s) => s.id === attachment.script);
      if (!asset) continue;
      const mod = load(asset);
      if (mod instanceof Error) {
        report(asset.name, "compile/module", mod);
        continue;
      }
      if (typeof mod.default !== "function") {
        report(
          asset.name,
          "module",
          "Attached script must export default a factory or class extending Script",
        );
        continue;
      }
      let props: Record<string, ScriptValue>;
      try {
        props = structuredClone({ ...mod.defaults, ...attachment.props });
      } catch (error) {
        report(asset.name, "defaults", error);
        continue;
      }
      const cleanup = new Set<() => void>();
      let inactive = false;
      const time = { elapsed: 0, delta: 0, fixedDelta: 1 / 60, frame: 0 };
      const guardedUI = (listener: (event: UIEvent) => void) => (event: UIEvent) => {
        if (inactive) return;
        try {
          listener(event);
        } catch (error) {
          inactive = true;
          report(asset.name, "ui-event", error);
        }
      };
      const scopedUI: UIAPI = {
        get: (id) => host.ui.get(id),
        find: (name) => host.ui.find(name),
        snapshot: () => host.ui.snapshot(),
        create: (e) => host.ui.create(e),
        remove: (id) => host.ui.remove(id),
        patch: (id, patch) => host.ui.patch(id, patch),
        setText: (id, text) => host.ui.setText(id, text),
        setValue: (id, value) => host.ui.setValue(id, value),
        setVisible: (id, value) => host.ui.setVisible(id, value),
        show: (id) => host.ui.show(id),
        hide: (id) => host.ui.hide(id),
        setEnabled: (id, value) => host.ui.setEnabled(id, value),
        setStyle: (id, style) => host.ui.setStyle(id, style),
        on: (id, type, listener) => {
          const off = host.ui.on(id, type, guardedUI(listener));
          cleanup.add(off);
          return () => {
            off();
            cleanup.delete(off);
          };
        },
        onAction: (action, listener) => {
          const off = host.ui.onAction(action, guardedUI(listener));
          cleanup.add(off);
          return () => {
            off();
            cleanup.delete(off);
          };
        },
      };
      const context: ScriptContext = {
        ui: scopedUI,
        engine: host,
        entity,
        object: host.objects.get(entity.id)!,
        props,
        state: {},
        input: host.input,
        time,
        number: (name, fallback = 0) =>
          typeof props[name] === "number" && Number.isFinite(props[name])
            ? (props[name] as number)
            : fallback,
        string: (name, fallback = "") =>
          typeof props[name] === "string" ? (props[name] as string) : fallback,
        boolean: (name, fallback = false) =>
          typeof props[name] === "boolean" ? (props[name] as boolean) : fallback,
        vector: (name, fallback = [0, 0, 0]) => {
          const v = props[name];
          return new THREE.Vector3(
            ...(Array.isArray(v) &&
            v.length === 3 &&
            v.every((n) => typeof n === "number" && Number.isFinite(n))
              ? (v as [number, number, number])
              : fallback),
          );
        },
        spawn: (e) => host.spawn(e),
        destroy: (id = entity.id) => host.destroy(id),
        find: (id) => host.document.entities.find((e) => e.id === id || e.name === id),
        findByTag: (tag) => host.document.entities.filter((e) => e.tag === tag),
        objectFor: (id) => host.objects.get(id),
        body: (id = entity.id) => host.physics.bodies.get(id),
        teleport(position, id = entity.id) {
          const body = host.physics.bodies.get(id);
          body?.setTranslation({ x: position[0], y: position[1], z: position[2] }, true);
          host.objects.get(id)?.position.fromArray(position);
        },
        impulse(force, id = entity.id) {
          host.physics.bodies
            .get(id)
            ?.applyImpulse({ x: force[0], y: force[1], z: force[2] }, true);
        },
        log: (message) =>
          host.events.emit("script", message, { entity: entity.id, script: asset.name }),
        emit: (name, data) => host.events.emit("custom:" + name, name, data),
        onEvent(name, listener) {
          const off = host.events.subscribe((event) => {
            if (inactive || event.type !== "custom:" + name) return;
            try {
              listener(event);
            } catch (error) {
              inactive = true;
              report(asset.name, "event", error);
            }
          });
          cleanup.add(off);
          return () => {
            off();
            cleanup.delete(off);
          };
        },
      };
      const wrapped = safeBehavior(
        () => {
          const factory = mod.default;
          if (factory.constructor.name === "AsyncFunction")
            throw Error("Script factories must be synchronous");
          const instance =
            factory.prototype instanceof SDK.Script
              ? new (factory as new (ctx: ScriptContext) => Behavior)(context)
              : (factory as SDK.GameScriptFactory)(context);
          if (!instance || typeof instance !== "object" || "then" in instance) {
            if (instance && typeof instance === "object" && "then" in instance)
              void Promise.resolve(instance).catch(() => {});
            throw Error("Return synchronous lifecycle hooks, not a Promise");
          }
          for (const hook of ["start", "fixedUpdate", "update", "trigger", "dispose"] as const)
            if (
              instance[hook] !== undefined &&
              (typeof instance[hook] !== "function" ||
                instance[hook]?.constructor.name === "AsyncFunction")
            )
              throw Error("Lifecycle " + hook + " must be a synchronous function");
          return instance;
        },
        { engine: host, entity },
        (hook, error) => {
          inactive = true;
          report(asset.name, hook, error);
        },
      );
      instances.push({
        start() {
          wrapped.start?.();
        },
        fixedUpdate(dt) {
          if (inactive) return;
          time.delta = dt;
          time.fixedDelta = dt;
          time.elapsed += dt;
          wrapped.fixedUpdate?.(dt);
        },
        update(dt) {
          if (inactive) return;
          time.delta = dt;
          time.frame++;
          wrapped.update?.(dt);
        },
        trigger(other, started) {
          if (!inactive) wrapped.trigger?.(other, started);
        },
        dispose() {
          inactive = true;
          wrapped.dispose?.();
          for (const off of cleanup) off();
          cleanup.clear();
        },
      });
    }
    return {
      start() {
        for (const b of instances) b.start?.();
      },
      fixedUpdate(dt) {
        for (const b of instances) b.fixedUpdate?.(dt);
      },
      update(dt) {
        for (const b of instances) b.update?.(dt);
      },
      trigger(other, started) {
        for (const b of instances) b.trigger?.(other, started);
      },
      dispose() {
        for (const b of instances) b.dispose?.();
      },
    };
  };
}
