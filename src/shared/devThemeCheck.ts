import type { Theme } from "./theme";

declare const process: { env: { NODE_ENV?: string } };

export function warnAboutTheme(theme: Theme): void {
  if (process.env.NODE_ENV === "production") return;
  void import("corpus-map/theme-check").then(({ checkTheme }) => {
    for (const problem of checkTheme(theme)) {
      // biome-ignore lint/suspicious/noConsole: the development warning is the feature (consumer styles spec §5)
      console.warn(problem);
    }
  });
}
