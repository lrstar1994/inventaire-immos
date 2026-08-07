import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const shell = await readFile("app/components/app-shell.js", "utf8");
const page = await readFile("app/users/page.js", "utf8");
const manager = await readFile("app/users/user-manager.js", "utf8");
const usersApi = await readFile("app/api/users/route.js", "utf8");
const userApi = await readFile("app/api/users/[id]/route.js", "utf8");
const rolesApi = await readFile("app/api/roles/route.js", "utf8");
const authorization = await readFile("lib/authorization.js", "utf8");

test("seul DIRECTION reçoit users.manage", () => {
  const direction = authorization.match(/DIRECTION:[\s\S]*?INVENTORY_MANAGER:/)?.[0] || "";
  const inventory = authorization.match(/INVENTORY_MANAGER:[\s\S]*?MAINTENANCE_MANAGER:/)?.[0] || "";
  const maintenance = authorization.match(/MAINTENANCE_MANAGER:[\s\S]*?BASIC_USER:/)?.[0] || "";
  const basic = authorization.match(/BASIC_USER:[\s\S]*?\n\s*}\n}\);/)?.[0] || "";
  assert.match(direction, /Object\.values\(APP_PERMISSIONS\)/);
  assert.doesNotMatch(inventory, /USERS_MANAGE/);
  assert.doesNotMatch(maintenance, /USERS_MANAGE/);
  assert.doesNotMatch(basic, /USERS_MANAGE/);
});

test("le menu Utilisateurs est filtré par la permission serveur", () => {
  assert.match(shell, /href: "\/users", label: "Utilisateurs", icon: "users", permission: APP_PERMISSIONS\.USERS_MANAGE/);
  assert.match(shell, /hasPermission\(appUser, item\.permission\)/);
  assert.match(shell, /name === "users"/);
  assert.match(shell, /Accès autorisé/);
  assert.match(shell, /Déconnexion/);
});

test("la page /users refuse côté serveur toute permission insuffisante", () => {
  assert.match(page, /authorizePrivatePage\(\{ returnTo: "\/users" \}\)/);
  assert.match(page, /hasPermission\(access\.user, APP_PERMISSIONS\.USERS_MANAGE\)/);
  assert.match(page, /<AccessDenied status="insufficient_role"/);
  assert.ok(page.indexOf("hasPermission") < page.indexOf("await loadUsers()"));
});

test("la liste DIRECTION ne sélectionne aucun secret ni externalAuthId", () => {
  assert.match(page, /Gestion des utilisateurs/);
  for (const field of ["name", "email", "role", "status"]) assert.match(page, new RegExp(`${field}: true`));
  assert.doesNotMatch(page, /externalAuthId|access_token|refresh_token|password|cookie/i);
});

test("l'interface gère liste, erreurs, doublons, édition et désactivation confirmée", () => {
  assert.match(manager, /fetch\("\/api\/users", \{ cache: "no-store" \}\)/);
  assert.match(manager, /user\.email\.toLowerCase\(\) === email/);
  assert.match(manager, /method: isEditing \? "PATCH" : "POST"/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /method: "DELETE"/);
  assert.match(manager, /aria-live="assertive"/);
  assert.doesNotMatch(manager, /externalAuthId|access_token|refresh_token|service.role|password|cookie/i);
});

test("les API utilisateurs et rôles restent protégées par users.manage", () => {
  for (const source of [usersApi, userApi, rolesApi]) {
    assert.match(source, /authorizeApiRequest\(APP_PERMISSIONS\.USERS_MANAGE\)/);
  }
});

test("le shell privé reste absent sans session autorisée", () => {
  assert.match(shell, /access\.status !== "authorized"/);
  assert.match(shell, /return children/);
});
