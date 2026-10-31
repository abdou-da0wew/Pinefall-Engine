import { test, expect } from "bun:test";
import { safeBehavior } from "../packages/runtime/src/behavior-safety";
import type { BehaviorContext } from "../packages/runtime/src/behaviors";
const context = {} as BehaviorContext;
test("a throwing script disables once without interrupting others; cleanup still runs", () => {
  const failures: string[] = [];
  let calls = 0,
    cleanups = 0;
  const script = safeBehavior(
    () => ({
      update() {
        calls++;
        throw Error("bad script");
      },
      dispose() {
        cleanups++;
      },
    }),
    context,
    (hook) => failures.push(hook),
  );
  script.update?.(0.1);
  script.update?.(0.1);
  script.dispose?.();
  script.dispose?.();
  expect(calls).toBe(1);
  expect(cleanups).toBe(1);
  expect(failures).toEqual(["update"]);
});
test("factory and cleanup errors are contained", () => {
  const failures: string[] = [];
  const report = (hook: string) => failures.push(hook);
  expect(() =>
    safeBehavior(
      () => {
        throw Error("factory");
      },
      context,
      report,
    ),
  ).not.toThrow();
  const b = safeBehavior(
    () => ({
      dispose() {
        throw Error("cleanup");
      },
    }),
    context,
    report,
  );
  expect(() => b.dispose?.()).not.toThrow();
  expect(failures).toEqual(["factory", "dispose"]);
});
