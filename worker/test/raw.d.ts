// Vite serves these as strings via the ?raw suffix.
declare module '*?raw' {
  const content: string;
  export default content;
}
