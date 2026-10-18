import { defineConfig } from "jest";

export default defineConfig({
    testEnvironment: "node",
    testMatch: ["**/tests/**/*.test.js"],
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ["<rootDir>/tests/setupEnvironment.js"],
});
