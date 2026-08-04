declare module 'snappyjs' {
  export function compress(input: Uint8Array): Uint8Array;
  export function uncompress(input: Uint8Array): Uint8Array;
  const snappy: {
    compress: typeof compress;
    uncompress: typeof uncompress;
  };
  export default snappy;
}
