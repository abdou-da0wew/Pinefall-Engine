interface Window {
  engineDesktop?: { save(name: string, text: string): Promise<boolean>; ready(): void };
}
