module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@kashyap/contracts$': '<rootDir>/../../packages/contracts/dist',
    '^@kashyap/localization$': '<rootDir>/../../packages/localization/dist',
    '^@kashyap/test-fixtures$': '<rootDir>/../../packages/test-fixtures/dist',
    '^@kashyap/design-tokens$': '<rootDir>/../../packages/design-tokens/dist',
  }
};
