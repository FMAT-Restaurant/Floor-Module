// Configuración separada para pruebas de integración (necesitan PostgreSQL real).
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgrespassword@localhost:5432/floor_module_db?schema=public';

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  // @floor/shared es ESM y la API es CommonJS: igual que en jest.config.js, se usa su código fuente.
  moduleNameMapper: {
    '^@floor/shared$': '<rootDir>/../../packages/shared/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  maxWorkers: 1, // las pruebas comparten una sola BD: se ejecutan en serie
  testTimeout: 20000,
};
