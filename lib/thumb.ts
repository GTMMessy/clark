// Arcade's product photos are large PNGs; this asks Next's image optimizer for a small copy.
export const thumb = (src: string, width: 128 | 256 | 640) =>
  `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=75`;
