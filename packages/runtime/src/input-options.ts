export interface InputOptions {
  recoverKey: string | null;
  pointerLockOnClick: boolean;
  sensitivity: number;
}
export const DEFAULT_INPUT_OPTIONS: InputOptions = {
  recoverKey: "KeyR",
  pointerLockOnClick: false,
  sensitivity: 0.003,
};
export function parseInputOptions(input: InputOptions): InputOptions {
  if (
    Object.keys(input).some((key) => !Object.hasOwn(DEFAULT_INPUT_OPTIONS, key)) ||
    (input.recoverKey !== null && !/^Key[A-Z]$/.test(input.recoverKey)) ||
    typeof input.pointerLockOnClick !== "boolean" ||
    !Number.isFinite(input.sensitivity) ||
    input.sensitivity < 0.0001 ||
    input.sensitivity > 0.02
  )
    throw Error("Invalid input options");
  return { ...input };
}
