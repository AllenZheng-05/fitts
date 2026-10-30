// Vite's `?raw` imports: the file's text (the probes IIFE, SPEC-phase2 §7).
declare module '*?raw' {
  const text: string;
  export default text;
}
