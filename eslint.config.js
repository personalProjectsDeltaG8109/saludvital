import js from "@eslint/js";

// Define the recommended rules and project-specific validation settings.
export default [
    {
        // Ignore installed packages and generated files.
        ignores: ["node_modules/**", "coverage/**", "public/css/**", "dist/**"],
    },
    {
        // Apply the recommended JavaScript rules to project source files.
        files: ["**/*.js"],
        ...js.configs.recommended,
        languageOptions: {
            // The project uses modern JavaScript modules on Node.js.
            ecmaVersion: "latest",
            sourceType: "module",
            globals: {
                // Define the Node.js globals used by application and test files.
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
            },
        },
        rules: {
            // Require unused variables to be removed, except for ignored arguments.
            "no-unused-vars": [
                "error",
                {
                    argsIgnorePattern: "^_",
                    varsIgnorePattern: "^_",
                },
            ],
        },
    },
];
