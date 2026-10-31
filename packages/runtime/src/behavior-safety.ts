import type { Behavior, BehaviorContext, BehaviorFactory } from "./behaviors";
/** Isolate synchronous script failures. This is not a security sandbox or timeout. */
export function safeBehavior(
  factory: BehaviorFactory,
  context: BehaviorContext,
  report: (hook: string, error: unknown) => void,
): Behavior {
  let behavior: Behavior,
    failed = false,
    disposed = false;
  try {
    behavior = factory(context);
  } catch (error) {
    report("factory", error);
    return {};
  }
  function invoke(hook: keyof Behavior, run: () => void) {
    if (failed) return;
    try {
      run();
    } catch (error) {
      failed = true;
      report(hook, error);
    }
  }
  return {
    start() {
      invoke("start", () => behavior.start?.());
    },
    fixedUpdate(dt) {
      invoke("fixedUpdate", () => behavior.fixedUpdate?.(dt));
    },
    update(dt) {
      invoke("update", () => behavior.update?.(dt));
    },
    trigger(other, started) {
      invoke("trigger", () => behavior.trigger?.(other, started));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      try {
        behavior.dispose?.();
      } catch (error) {
        report("dispose", error);
      }
    },
  };
}
