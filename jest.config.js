/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/", "/analysis/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "tsconfig.node.json" },
    ],
  },
  moduleNameMapper: {
    "^@shared/(.*)$": "<rootDir>/src/shared/$1",
    "^@paperweight/analysis/contracts$": "<rootDir>/analysis/src/contracts.ts",
    "^@paperweight/analysis/country$": "<rootDir>/analysis/src/country.ts",
    "^@paperweight/analysis/profile-values$": "<rootDir>/analysis/src/profile-values.ts",
    // DELIBERATE asymmetry: the bundler and tsc resolve @paperweight/analysis to
    // the engine's index.ts, but the real module imports ESM (htmlparser2, franc)
    // that the CJS jest runner cannot load. So tests point at the html-to-text
    // submodule as a resolvable target and MUST jest.mock("@paperweight/analysis")
    // with a factory for anything they actually call (analyzeMessage,
    // analyzeText, regionFromDomain). Real detection/extraction/classification
    // is covered by the analysis vitest suite; app tests only verify the
    // handoff and the persistence/aggregation wiring around it.
    "^@paperweight/analysis$": "<rootDir>/analysis/src/extract/html-to-text.ts",
  },
};
