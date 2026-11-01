interface Window {
  engineDesktop?: {
    save(name: string, text: string | Uint8Array): Promise<boolean>;
    getGraphics(): Promise<import("./graphics").GraphicsState>;
    saveGraphics(
      value: import("./graphics").GraphicsPreferences,
    ): Promise<import("./graphics").GraphicsState>;
  };
}
