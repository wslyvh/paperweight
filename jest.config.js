const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",

  // Use ts-jest for TS files
  transform: {
    ...tsJestTransformCfg,
  },

  // Tell ts-jest to use your Node tsconfig
  globals: {
    "ts-jest": {
      tsconfig: "tsconfig.node.json",
    }
  },

  // Support your TS path alias: @shared/*
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
  },
};
