// 2.4.1 ships the same public exports in index.js/index.mjs but only index.d.ts.
declare module "prism-react-renderer/dist/index.mjs" {
  export { Prism } from "prism-react-renderer";
}
