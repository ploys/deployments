module.exports = {
  roots: ['<rootDir>/packages/'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testEnvironment: 'node',
  testRegex: '(/tests/.*|(\\.|/)(test|spec))\\.ts$',
  moduleFileExtensions: ['ts', 'js'],
  moduleNameMapper: {
    "@ploys/deployments-(.*)": "<rootDir>/packages/$1/src/index.ts"
  },
}
