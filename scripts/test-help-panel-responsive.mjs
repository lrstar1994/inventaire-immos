import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helpPanelPath = new URL("../app/components/help-panel.js", import.meta.url);
const stylesPath = new URL("../app/globals.css", import.meta.url);
const appShellPath = new URL("../app/components/app-shell.js", import.meta.url);

test("the shared help trigger keeps its desktop label and exposes a compact mobile label", async () => {
  const source = await readFile(helpPanelPath, "utf8");

  assert.match(source, /aria-label="Comprendre l’écran"/);
  assert.match(source, /help-toggle-desktop">Comprendre l’écran</);
  assert.match(source, /className="help-toggle-mobile" aria-hidden="true"/);
  assert.match(source, /\? Aide/);
});

test("mobile help stays compact, touchable and scrollable at the shared 760px breakpoint", async () => {
  const css = await readFile(stylesPath, "utf8");
  const mobileStart = css.indexOf("@media (max-width: 760px)");
  const mobileCss = css.slice(mobileStart);

  assert.notEqual(mobileStart, -1);
  assert.match(mobileCss, /\.help-widget\s*\{[^}]*left:\s*auto;[^}]*max-width:\s*calc\(100vw - 24px\);[^}]*right:\s*12px;/s);
  assert.match(mobileCss, /\.help-toggle\s*\{[^}]*min-height:\s*44px;[^}]*width:\s*auto;/s);
  assert.match(mobileCss, /\.help-toggle-desktop\s*\{[^}]*display:\s*none;/s);
  assert.match(mobileCss, /\.help-toggle-mobile\s*\{[^}]*display:\s*inline;/s);
  assert.match(mobileCss, /\.help-panel\s*\{[^}]*max-height:[^;]+;[^}]*overflow-y:\s*auto;[^}]*width:\s*min\(360px, calc\(100vw - 24px\)\);/s);
});

test("desktop styles keep the existing floating help treatment and the app shell uses it once", async () => {
  const [css, appShell] = await Promise.all([
    readFile(stylesPath, "utf8"),
    readFile(appShellPath, "utf8"),
  ]);
  const desktopCss = css.slice(0, css.indexOf("@media (max-width: 760px)"));

  assert.match(desktopCss, /\.help-widget\s*\{[^}]*bottom:\s*20px;[^}]*right:\s*20px;/s);
  assert.match(desktopCss, /\.help-toggle-mobile\s*\{[^}]*display:\s*none;/s);
  assert.equal((appShell.match(/<HelpPanel\s*\/>/g) || []).length, 1);
});
