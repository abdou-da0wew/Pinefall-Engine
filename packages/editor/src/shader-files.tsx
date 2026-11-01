import { useEffect, useRef, useState } from "react";
import { DEFAULT_SHADER, type ShaderSource } from "../../runtime/src/shader-definition";
import { readShaderFile, type ShaderFileKind } from "./shader-file-import";
import { Button, Input } from "./ui";
/** Browser file exchange, deliberately not an embedded source editor. */
export function ShaderFiles({
  initial,
  trusted,
  onApply,
  onExport,
}: {
  initial?: ShaderSource;
  trusted: boolean;
  onApply: (source: ShaderSource, signal: AbortSignal) => Promise<void>;
  onExport: (name: string, text: string) => Promise<void>;
}) {
  const [candidate, setCandidate] = useState<ShaderSource>(initial ?? DEFAULT_SHADER);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function importFile(file: File, kind: ShaderFileKind) {
    operation.current?.abort();
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await readShaderFile(file, kind, candidate);
      controller.signal.throwIfAborted();
      setCandidate(next);
      setDirty(true);
      setMessage(file.name + " read; not compiled or applied. Explicit Apply is required.");
    } catch (error) {
      if (!controller.signal.aborted) setError(String(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  async function apply() {
    if (busy || !dirty || !trusted || error) return;
    const controller = new AbortController();
    operation.current?.abort();
    operation.current = controller;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await onApply(candidate, controller.signal);
      controller.signal.throwIfAborted();
      setDirty(false);
      setMessage("Shader files applied after successful GPU compilation.");
    } catch (error) {
      if (!controller.signal.aborted) setError(String(error));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section aria-label="Browser shader files">
      <h3>Shader file exchange</h3>
      <p>
        Edit GLSL and uniform JSON in your external editor, then import them here. The selected mesh
        is the target; editing an existing shared shader updates its users. No source editor is
        embedded.
      </p>
      <p>
        {trusted
          ? "Custom shader preview is explicitly enabled."
          : "Enable trusted custom shader preview in Rendering before Apply. Import alone never grants trust."}
      </p>
      {(["fragment", "uniforms"] as const).map((kind) => (
        <label key={kind}>
          {kind === "fragment" ? "Import GLSL fragment" : "Import shader uniforms JSON"}
          <Input
            type="file"
            accept={kind === "fragment" ? ".glsl" : ".json"}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void importFile(file, kind);
            }}
          />
        </label>
      ))}
      <small>
        Fragment: 16,384 characters. Uniform JSON: 4,096 characters, at most 16 uniforms. UTF-8 byte
        limits are four times the character limits. GLSL must define shade(vec2, vec3), not a
        standalone main().
      </small>
      <div className="script-toolbar">
        <Button disabled={busy || !dirty || !trusted || !!error} onClick={() => void apply()}>
          Compile and apply imported shader
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void onExport("shader.glsl", candidate.fragment).catch((e) => setError(String(e)))
          }
        >
          Export GLSL fragment
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            void onExport(
              "shader.uniforms.json",
              JSON.stringify(candidate.uniforms, null, 2),
            ).catch((e) => setError(String(e)))
          }
        >
          Export shader uniforms
        </Button>
      </div>
      {message && <p role="status">{message}</p>}
      {error && (
        <p role="alert">
          {error} Previous working shader retained. Import a corrected file to retry.
        </p>
      )}
    </section>
  );
}
