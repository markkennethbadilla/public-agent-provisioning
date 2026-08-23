export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    "tool.execute.before": async (input) => {
      {
        const __re = new RegExp("Write|Edit|MultiEdit|NotebookEdit");
        if (__re.test(input.tool)) {
          await $`gitleaks stdin -v --no-color --no-banner --redact --exit-code 2 1>&2`;
        }
      }
    },
  };
};
