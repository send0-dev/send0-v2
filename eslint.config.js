// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/dist/",
    "**/out/",
    "**/.next/",
    "**/.astro/",
    "**/.wrangler/",
    "**/.source/",
    "**/coverage/",
    "**/worker-configuration.d.ts",
    "**/next-env.d.ts",
    "packages/sdk/src/generated/",
    "packages/sdk-python/",
    "packages/langchain-python/",
    "apps/web/e2e/shots/",
    "apps/www/shots/",
    "docs/",
  ]),

  js.configs.recommended,
  tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports", disallowTypeAnnotations: false }],
      "@typescript-eslint/no-unused-expressions": ["error", { allowTernary: true, allowShortCircuit: true }],
      "@typescript-eslint/no-this-alias": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-import-type-side-effects": "error",
      eqeqeq: ["error", "smart"],
      "no-console": "off",
      "prefer-const": "error",
    },
  },

  // Type-aware rules for TypeScript. Workers drop unawaited promises silently, so these matter.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/switch-exhaustiveness-check": ["error", { considerDefaultExhaustiveForUnions: true }],
    },
  },

  // The dashboard and the docs site are React.
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/docs/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // We don't run the React Compiler, so skipping it for react-hook-form's watch() costs nothing.
      "react-hooks/incompatible-library": "off",
    },
  },
  // Config files, scripts and tests in the dashboard are typed by tsconfig.node.json.
  {
    files: ["apps/web/{test,scripts}/**/*.ts", "apps/web/*.config.ts"],
    languageOptions: { parserOptions: { projectService: false, project: "apps/web/tsconfig.node.json" } },
  },
  {
    files: ["apps/web/src/**/*.tsx"],
    plugins: { "react-refresh": reactRefresh },
    rules: {
      // A provider with its hook, or a component with its variants, may share a file.
      "react-refresh/only-export-components": [
        "error",
        { allowConstantExport: true, allowExportNames: ["useTheme", "useCommandMenu", "useFormField", "buttonVariants"] },
      ],
    },
  },
  {
    files: ["apps/web/e2e/**", "apps/www/src/**/*.{js,ts}", "apps/www/scripts/**"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // Tests may lean on `any` and non-null assertions for brevity.
  {
    files: ["**/test/**", "**/*.test.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-misused-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  prettier,
);
