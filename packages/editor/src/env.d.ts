interface Window {
  engineDesktop?: {
    save(name: string, text: string | Uint8Array): Promise<boolean>;
    ready(): void;
  };
}
