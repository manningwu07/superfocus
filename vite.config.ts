import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { NormalizedOutputOptions, OutputBundle, PreRenderedChunk } from "rolldown";
import { defineConfig, loadEnv, type ConfigEnv, type Plugin, type UserConfig } from "vite";

const CLIENT_ID_PLACEHOLDER: string = "REPLACE_WITH_GOOGLE_CLIENT_ID.apps.googleusercontent.com";

function manifestPlugin(clientId: string): Plugin {
  return {
    name: "inject-google-client-id",
    async generateBundle(
      _options: NormalizedOutputOptions,
      _bundle: OutputBundle,
    ): Promise<void> {
      const manifestPath: string = resolve(import.meta.dirname, "public/manifest.json");
      const manifest: string = await readFile(manifestPath, "utf8");
      const output: string = manifest.replace(CLIENT_ID_PLACEHOLDER, clientId);
      this.emitFile({ type: "asset", fileName: "manifest.json", source: output });
    },
  };
}

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const environment: Record<string, string> = loadEnv(mode, import.meta.dirname, "");
  const suppliedClientId: string = environment.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientId: string = suppliedClientId.length > 0 ? suppliedClientId : CLIENT_ID_PLACEHOLDER;
  const configured: boolean = suppliedClientId.length > 0;
  return {
    server: { host: "127.0.0.1", port: 5173, strictPort: true },
    define: {
      __GOOGLE_CLIENT_ID_CONFIGURED__: JSON.stringify(configured),
    },
    plugins: [manifestPlugin(clientId)],
    publicDir: false,
    build: {
      rollupOptions: {
        input: {
          dashboard: resolve(import.meta.dirname, "index.html"),
          popup: resolve(import.meta.dirname, "popup.html"),
          blocked: resolve(import.meta.dirname, "blocked.html"),
          background: resolve(import.meta.dirname, "src/background.ts"),
        },
        output: {
          entryFileNames: (chunkInfo: PreRenderedChunk): string =>
            chunkInfo.name === "background" ? "assets/background.js" : "assets/[name]-[hash].js",
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: "assets/[name]-[hash][extname]",
        },
      },
    },
  };
});
