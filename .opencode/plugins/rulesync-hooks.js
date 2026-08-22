export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    "tool.execute.before": async (input) => {
      {
        const __re = new RegExp("Write|Edit|MultiEdit|NotebookEdit");
        if (__re.test(input.tool)) {
          await $`node .rulesync/hooks/deny-secret-in-write.mjs`;
        }
      }
    },
  };
};
