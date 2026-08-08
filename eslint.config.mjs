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
      // esbuild output that lands next to hand-written webview assets.
      "apps/*/media/webview.js",
      "apps/*/media/**/*.map",
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
    // TypeScript resolves identifiers itself; no-undef only produces false
    // positives on DOM and Node globals that tsconfig `lib` already covers.
    files: ["**/*.ts"],
    rules: { "no-undef": "off" },
  },
  {
    // Build scripts run in Node and reporting what they built is their job.
    files: ["**/*.mjs", "**/*.js", "scripts/**"],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
      },
    },
    rules: { "no-console": "off" },
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
