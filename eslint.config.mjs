// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/out/**",
      "**/node_modules/**",
      "**/*.d.ts",
      "design/**",
      "assets/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // The whole product hinges on not leaking timers. Force the engine to go
      // through its own Clock adapter rather than reaching for globals.
      "no-restricted-globals": [
        "error",
        { name: "setInterval", message: "Pandy uses one chained setTimeout via the injected Clock. No polling." },
        { name: "setImmediate", message: "Use the injected Clock." },
      ],
    },
  },
  {
    // Tests drive fake timers directly and legitimately need the globals.
    files: ["**/*.test.ts", "tests/**/*.ts"],
    rules: {
      "no-restricted-globals": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
