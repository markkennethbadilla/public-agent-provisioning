// Maintainability gate (register B13): size and complexity only; old debt lives in eslint-suppressions.json.
import n from "eslint-plugin-n";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";

export default [
  { ignores: ["node_modules/**", "styles/**", ".agents/**", ".claude/**", ".cline/**", ".cursor/**", ".grok/**", ".opencode/**", ".github/**", ".rulesync/skills/.curated/**", "**/*.cjs"] },
  { linterOptions: { reportUnusedDisableDirectives: "error" } },
  {
    files: ["**/*.{js,mjs}"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } },
    plugins: { sonarjs, n },
    rules: {
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 120, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 20],
      "max-depth": ["error", 5],
      "sonarjs/cognitive-complexity": ["error", 15],
      "sonarjs/no-identical-functions": "error",
      "sonarjs/no-commented-code": "error",
      "n/no-deprecated-api": "error",
      "no-restricted-syntax": ["error", { selector: "CallExpression[callee.property.name=/^(skip|only|todo)$/][callee.object.name=/^(test|it|describe)$/]", message: "No skipped or focused tests: fix or delete it." }],
      "no-warning-comments": ["error", { terms: ["todo", "fixme", "hack"] }],
    },
  },
];
