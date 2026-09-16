/**
 * wrangler は `*.wasm` を CompiledWasm モジュールとして束ね、既定エクスポートが
 * `WebAssembly.Module` になる。`initSync({ module })` にそのまま渡せる。
 */
declare module "*.wasm" {
  const module: WebAssembly.Module;
  export default module;
}
