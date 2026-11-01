import { useEffect, useRef, useState } from "react";
import { Button, Dialog, Textarea, Switch } from "./ui";
import {
  DEFAULT_SHADER,
  parseShader,
  type ShaderAsset,
  type ShaderSource,
} from "../../runtime/src/shader-definition";
export function ShaderDialog({
  asset,
  trusted,
  onCompile,
  onDraft,
  onClose,
}: {
  asset?: ShaderAsset;
  trusted: boolean;
  onCompile: (source: ShaderSource, signal: AbortSignal) => Promise<void>;
  onDraft: (draft: string, draftUniforms: string) => void;
  onClose: () => void;
}) {
  const [fragment, setFragment] = useState(
    asset?.draft ?? asset?.fragment ?? DEFAULT_SHADER.fragment,
  );
  const [uniforms, setUniforms] = useState(
    asset?.draftUniforms ?? JSON.stringify(asset?.uniforms ?? DEFAULT_SHADER.uniforms, null, 2),
  );
  const [consent, setConsent] = useState(trusted),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  return (
    <Dialog
      className="pf-shader-dialog"
      title="Custom unlit shader"
      description="Trusted GLSL only. GPU code can stall the driver; JavaScript cannot reliably preempt it. Static size checks are not a security sandbox."
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
    >
      <p>
        Implement <code>vec4 shade(vec2 uv, vec3 worldPosition)</code>. Return linear RGBA. Engine
        vertex transforms include skinning/morphs. Custom unlit surfaces do not cast shadows;
        lit/depth variants are not implied. Reserved <code>uTime</code> is elapsed rendered seconds.
      </p>
      <label className="row-field">
        Allow trusted GPU code this editor session
        <Switch
          aria-label="Trust custom shader"
          checked={consent}
          disabled={busy}
          onChange={(e) => setConsent(e.target.checked)}
        />
      </label>
      <label>
        Fragment function
        <Textarea
          aria-label="Shader fragment draft"
          rows={10}
          value={fragment}
          disabled={busy}
          onChange={(e) => setFragment(e.target.value)}
        />
      </label>
      <label>
        Typed uniforms (JSON)
        <Textarea
          aria-label="Shader uniforms"
          rows={4}
          value={uniforms}
          disabled={busy}
          onChange={(e) => setUniforms(e.target.value)}
        />
      </label>
      {error && <pre role="alert">{error}</pre>}
      <footer>
        <Button
          onClick={() => {
            abort.current?.abort();
            onClose();
          }}
        >
          Cancel
        </Button>
        <Button
          disabled={busy || !asset}
          onClick={() => {
            try {
              if (fragment.length > 16384 || uniforms.length > 4096)
                throw Error("Shader draft budget exceeded");
              onDraft(fragment, uniforms);
            } catch (e) {
              setError(String(e));
            }
          }}
        >
          Save draft only
        </Button>
        <Button
          variant="primary"
          disabled={busy || !consent}
          onClick={async () => {
            setBusy(true);
            setError("");
            const controller = new AbortController();
            abort.current = controller;
            try {
              const source = parseShader({ version: 1, fragment, uniforms: JSON.parse(uniforms) });
              await onCompile(source, controller.signal);
              if (!controller.signal.aborted) onClose();
            } catch (e) {
              if (!controller.signal.aborted) setError(String(e));
            } finally {
              if (!controller.signal.aborted) setBusy(false);
            }
          }}
        >
          {busy ? "Compiling…" : "Compile and apply"}
        </Button>
      </footer>
    </Dialog>
  );
}
