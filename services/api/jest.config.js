module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@kashyap/contracts$': '<rootDir>/../../packages/contracts/src',
    '^@kashyap/localization$': '<rootDir>/../../packages/localization/src',
    '^@kashyap/test-fixtures$': '<rootDir>/../../packages/test-fixtures/src',
    '^@kashyap/design-tokens$': '<rootDir>/../../packages/design-tokens/src',
    '(\\.+)/enums\\.js$': '$1/enums',
    '(\\.+)/errors\\.js$': '$1/errors',
    '(\\.+)/auth\\.js$': '$1/auth',
    '(\\.+)/genealogy\\.js$': '$1/genealogy',
    '(\\.+)/claims\\.js$': '$1/claims',
    '(\\.+)/change-requests\\.js$': '$1/change-requests',
    '(\\.+)/cultural-rules\\.js$': '$1/cultural-rules',
    '(\\.+)/lineage\\.js$': '$1/lineage',
    '(\\.+)/ne\\.js$': '$1/ne',
    '(\\.+)/en\\.js$': '$1/en',
    '(\\.+)/colors\\.js$': '$1/colors'
  }
};
