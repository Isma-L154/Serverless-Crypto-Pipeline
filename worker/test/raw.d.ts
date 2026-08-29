// Vite serves these as strings via the ?raw suffix.
declare module '*?raw' {
  const content: string;
  export default content;
}

// And as a base64 data URI via ?inline, which is how a binary asset reaches a
// test running inside the Workers runtime, where there is no filesystem.
declare module '*?inline' {
  const dataUri: string;
  export default dataUri;
}
