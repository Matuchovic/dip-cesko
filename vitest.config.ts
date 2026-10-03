import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src'), 'server-only': path.resolve(__dirname, 'tests/stubs/server-only.ts') } },
  // stavba 3D geometrie je náročná – pod zátěží (souběžný build) může trvat přes 5 s
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', reporters: 'default', testTimeout: 20_000 },
});
