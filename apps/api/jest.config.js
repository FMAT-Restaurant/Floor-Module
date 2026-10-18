module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@floor/shared$': '<rootDir>/../../../packages/shared/src',
    // El código fuente de shared importa con extensión .js (ESM válido); Jest debe resolverlo a .ts
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
};