// Configuración separada para pruebas de integración (necesitan PostgreSQL real).
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  // @floor/shared es ESM y la API es CommonJS: igual que en jest.config.js, se usa su código fuente.
  moduleNameMapper: {
    '^@floor/shared$': '<rootDir>/../../packages/shared/src',
  },
  maxWorkers: 1, // las pruebas comparten una sola BD: se ejecutan en serie
  testTimeout: 20000,
};
