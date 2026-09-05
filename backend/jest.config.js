/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 15000,
  // The app schedules a background sync interval (db/index.ts) that is
  // intentional in production but has no natural teardown hook in tests.
  forceExit: true,
  // Integration tests share one sqlite file per worker; running them in
  // parallel workers would race on the same DB file.
  maxWorkers: 1,
};
