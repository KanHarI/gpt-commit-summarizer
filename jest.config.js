/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  "roots": [
    "./src"
  ],
  "testMatch": [
    "**/__tests__/**/*.+(ts|tsx|js)",
    "**/?(*.)+(spec|test).+(ts|tsx|js)"
  ],
  preset: 'ts-jest',
  testEnvironment: 'node',
};
