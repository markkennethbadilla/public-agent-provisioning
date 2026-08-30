export const RulesyncHooksPlugin = async ({ $ }) => {
  return {
    event: async ({ event }) => {
      if (event.type === "session.created") {
        await $`[ -n "$PLANNING_DISABLED" ] && exit 0; [ -d .planning ] && exit 0; SH=$(ls .claude/skills/planning-with-files/scripts/init-session.sh "$HOME/.claude/skills/planning-with-files/scripts/init-session.sh" "$HOME/.agents/skills/planning-with-files/scripts/init-session.sh" 2>/dev/null | head -1); [ -n "$SH" ] && sh "$SH" --gated plan >/dev/null 2>&1; exit 0`;
      }
      else if (event.type === "session.idle") {
        await $`SH=$(ls .claude/skills/planning-with-files/scripts/gate-stop.sh "$HOME/.claude/skills/planning-with-files/scripts/gate-stop.sh" "$HOME/.agents/skills/planning-with-files/scripts/gate-stop.sh" 2>/dev/null | head -1); [ -n "$SH" ] && sh "$SH" 2>/dev/null; exit 0`;
      }
    },
    "tool.execute.before": async (input) => {
      {
        const __re = new RegExp("Write|Edit|MultiEdit|NotebookEdit");
        if (__re.test(input.tool)) {
          await $`gitleaks stdin -v --no-color --no-banner --redact --exit-code 2 1>&2`;
        }
      }
      {
        const __re = new RegExp("TodoWrite|todowrite|todoread|todo_write|update_plan");
        if (__re.test(input.tool)) {
          await $`echo 'This project plans in files, not in a todo tool: put the plan in task_plan.md and track progress there (planning-with-files skill).' 1>&2; exit 2`;
        }
      }
    },
    "chat.message": async (input) => {
      await $`SH=$(ls .claude/skills/planning-with-files/scripts/inject-plan.sh "$HOME/.claude/skills/planning-with-files/scripts/inject-plan.sh" "$HOME/.agents/skills/planning-with-files/scripts/inject-plan.sh" 2>/dev/null | head -1); [ -n "$SH" ] && sh "$SH" --context=userprompt; exit 0`;
    },
    "tool.execute.after": async (input) => {
      {
        const __re = new RegExp("Write|Edit");
        if (__re.test(input.tool)) {
          await $`if [ -f task_plan.md ] || [ -f .planning/.active_plan ] || ls .planning/*/task_plan.md >/dev/null 2>&1; then echo '[planning-with-files] Update progress.md with what you just did. If a phase is now complete, update task_plan.md status.'; fi`;
        }
      }
    },
  };
};
