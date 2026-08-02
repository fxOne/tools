import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        // Three-line process wrapper around runCli(); nothing to assert.
        'src/bin.ts',
        // Type-only module, no runtime code.
        'src/types.ts',
      ],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
