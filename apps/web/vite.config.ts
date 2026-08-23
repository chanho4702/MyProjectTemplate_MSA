import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(() => {
  const gatewayProxyTarget = process.env.GATEWAY_PROXY_TARGET ?? "http://localhost:8080";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: gatewayProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: true,
      proxy: {
        "/api": {
          target: gatewayProxyTarget,
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: "jsdom",
      restoreMocks: true,
      // e2e는 Playwright가 실제 브라우저에서 실행한다. Vitest가 같은 파일을 집어가지 않게 한다.
      exclude: ["node_modules/**", "dist/**", "e2e/**", "e2e-oidc/**", "e2e-image/**"],
    },
  };
});
