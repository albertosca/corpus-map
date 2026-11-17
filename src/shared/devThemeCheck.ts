import type { Theme } from "./theme";

declare const process: { env: { NODE_ENV?: string } };

/** Every theme value `checkTheme` reads, so two themes with the same key get the same warning (once). */
export function themeKeyOf(theme: Theme): string {
  return JSON.stringify([
    theme.palette,
    theme.territoryLabel,
    theme.focusOutline,
    theme.pointNeutral,
    theme.territoryFillAlpha,
    theme.pointRadius,
    theme.edge,
    theme.selectionRing,
    theme.unvisitedRingWidth,
    theme.tones,
  ]);
}

const warned = new Set<string>();
let loading: Promise<typeof import("corpus-map/theme-check")> | undefined;

/** Test hook: forget which themes already warned. Not exported from the package entry. */
export function resetThemeWarnings(): void {
  warned.clear();
}

/**
 * Warns once per distinct theme, in development only, when `checkTheme` finds a problem (spec consumer-styles §5).
 * `corpus-map/theme-check` is loaded by a dynamic import behind the production guard, so a production bundle drops
 * the branch and the measurement code never enters the core. A failing load or check is swallowed: advisory only.
 */
export function warnAboutTheme(theme: Theme): void {
  // `typeof` first: native ESM and import maps have no `process`, and a throw in an effect would unmount the map.
  // The import sits inside the positive test, so a bundler that folds `NODE_ENV` has no reachable `import()` left.
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") {
    const key = themeKeyOf(theme);
    if (warned.has(key)) return;
    warned.add(key);
    // One load shared by every theme: concurrent `import()` calls of the same specifier would each wait on the loader.
    loading ??= import("corpus-map/theme-check");
    loading
      .then(({ checkTheme }) => {
        const problems = checkTheme(theme);
        if (problems.length === 0) return;
        const lines = problems.map((problem) => `- ${problem.message}`).join("\n");
        // biome-ignore lint/suspicious/noConsole: the development warning is the feature (consumer styles spec §5)
        console.warn(
          `corpus-map theme: ${problems.length} accessibility problem(s), measured on the theme's tones.ground ` +
            `(pass your page to checkTheme from "corpus-map/theme-check" for an exact answer):\n${lines}`,
        );
      })
      .catch(() => undefined);
  }
}
