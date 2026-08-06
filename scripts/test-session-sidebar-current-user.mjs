import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shellSource = await readFile("app/components/app-shell.js", "utf8");
const layoutSource = await readFile("app/layout.js", "utf8");
const cssSource = await readFile("app/globals.css", "utf8");
const authorizationSource = await readFile("lib/authorization.js", "utf8");

test("le layout délègue le shell à une source d'autorisation serveur", () => {
  assert.match(layoutSource, /<AppShell>\{children\}<\/AppShell>/);
  assert.match(shellSource, /async function AppShell/);
  assert.match(shellSource, /await getCurrentAppUser\(\)/);
});

test("aucun shell privé n'est rendu sans utilisateur applicatif autorisé", () => {
  assert.match(shellSource, /access\.status !== "authorized"/);
  assert.match(shellSource, /return children/);
  assert.doesNotMatch(shellSource, /Judi Randria|<small>Direction<\/small>/);
});

test("l'identité visible provient du User lié à externalAuthId", () => {
  assert.match(authorizationSource, /externalAuthId: resolvedAuthUser\.id/);
  assert.match(authorizationSource, /name: user\.name/);
  assert.match(shellSource, /\{appUser\.name\}/);
  assert.match(shellSource, /roleLabels\[appUser\.role\]/);
  assert.doesNotMatch(shellSource, /user\.email|authUser\.email/);
});

test("les menus sont calculés depuis les permissions serveur", () => {
  assert.match(shellSource, /hasPermission\(appUser, item\.permission\)/);
  assert.match(shellSource, /visibleNavItems\.map/);
  assert.doesNotMatch(shellSource, /localStorage|sessionStorage/);
});

test("les commandes d'écriture reçoivent les permissions calculées côté serveur", async () => {
  const expectations = [
    ["app/parc/page.js", /APP_PERMISSIONS\.ASSETS_WRITE/, /canWrite=/],
    ["app/parc/[id]/page.js", /APP_PERMISSIONS\.ASSETS_WRITE/, /canEdit=/],
    ["app/parc/[id]/page.js", /APP_PERMISSIONS\.FILES_UPLOAD/, /canUpload=/],
    ["app/parc/[id]/page.js", /APP_PERMISSIONS\.FILES_MANAGE/, /canManageFiles=/],
    ["app/documents/page.js", /APP_PERMISSIONS\.DOCUMENTS_WRITE/, /canWrite=/],
    ["app/mouvements/page.js", /APP_PERMISSIONS\.MOVEMENTS_CREATE/, /canCreate=/],
    ["app/mouvements/page.js", /APP_PERMISSIONS\.MOVEMENTS_MANAGE/, /canManage=/],
    ["app/referentiels/page.js", /APP_PERMISSIONS\.REFERENTIALS_WRITE/, /canWrite=/]
  ];
  for (const [file, permission, prop] of expectations) {
    const source = await readFile(file, "utf8");
    assert.match(source, /hasPermission\(access\.user,/);
    assert.match(source, permission);
    assert.match(source, prop);
  }
});

test("les composants client refusent visuellement les commandes sans permission", async () => {
  const sources = await Promise.all([
    readFile("app/parc/asset-park.js", "utf8"),
    readFile("app/documents/document-manager.js", "utf8"),
    readFile("app/mouvements/movement-manager.js", "utf8"),
    readFile("app/referentiels/reference-manager.js", "utf8")
  ]);
  assert.match(sources[0], /canWrite \? <aside/);
  assert.match(sources[1], /canWrite \? <aside/);
  assert.match(sources[2], /canCreate \? <aside/);
  assert.match(sources[2], /canManage && selectedMovement/);
  assert.match(sources[3], /canWrite \? <aside/);
  const detail = await readFile("app/parc/[id]/asset-unit-detail.js", "utf8");
  assert.match(detail, /canEdit \? <button/);
  assert.match(detail, /canUpload \? <button/);
  assert.match(detail, /canManageFiles \? <button/);
});

test("le logout reste une mutation serveur visible", () => {
  assert.match(shellSource, /<form action=\{logoutAction\}>/);
  assert.match(shellSource, /type="submit"/);
  assert.doesNotMatch(shellSource, /href=.*logout/i);
});

test("le responsive conserve l'identité et le logout", () => {
  const mobileBlock = cssSource.slice(cssSource.indexOf("@media (max-width: 760px)"));
  assert.match(mobileBlock, /\.sidebar-person\s*\{/);
  assert.match(mobileBlock, /\.app-header\s*\{/);
  assert.doesNotMatch(
    mobileBlock,
    /\.sidebar-person,\s*[\s\S]{0,80}\.app-header\s*\{\s*display:\s*none/
  );
});

test("aucune identité de démonstration ne subsiste dans les composants", async () => {
  const files = [
    "app/components/app-shell.js",
    "app/components/access-denied.js",
    "app/connexion/page.js"
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /Judi Randria|avatar[^]*JR/);
  }
});
