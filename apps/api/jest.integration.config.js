// Configuración separada para pruebas de integración (necesitan PostgreSQL real).
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: { '^.+\\.ts$': 'ts-jest' },
  maxWorkers: 1, // las pruebas comparten una sola BD: se ejecutan en serie
  testTimeout: 20000,
};
