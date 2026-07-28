import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.argv[2] || "http://127.0.0.1:3100";
const root = process.cwd();
const results = [];

async function checkPage(route) {
  const response = await fetch(`${baseUrl}${route}`);
  results.push({ test: `GET ${route}`, status: response.status, pass: response.status === 200 });
}

for (const route of ["/", "/referentiels", "/parc", "/documents", "/mouvements"]) {
  await checkPage(route);
}

const unitsResponse = await fetch(`${baseUrl}/api/asset-units`);
const unitsPayload = await unitsResponse.json();
const units = unitsPayload.units || unitsPayload.assetUnits || unitsPayload.items || unitsPayload.data || [];
const targetUnit = units.find((unit) => unit.assetCode === "LIT-KING-000002");
if (targetUnit) {
  await checkPage(`/parc/${targetUnit.id}`);
} else {
  results.push({ test: "Trouver LIT-KING-000002", status: "ABSENT", pass: false });
}

const testCode = `REPAIR-TEST-${Date.now()}`;
const existingResponse = await fetch(`${baseUrl}/api/suppliers?includeDisabled=true&q=REPAIR-TEST-`);
const existingPayload = await existingResponse.json();
for (const item of existingPayload.items || []) {
  if (item.code?.startsWith("REPAIR-TEST-") && !item.deletedAt) {
    await fetch(`${baseUrl}/api/suppliers/${item.id}`, { method: "DELETE" });
  }
}
const createResponse = await fetch(`${baseUrl}/api/suppliers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Fournisseur test réparation contrôlée",
    code: testCode,
    supplierType: "TEST",
    status: "ACTIVE"
  })
});
const createPayload = await createResponse.json();
const created = createPayload.item || createPayload.supplier || createPayload.data || createPayload;
results.push({
  test: "POST fournisseur test",
  status: createResponse.status,
  pass: createResponse.status === 201 && Boolean(created?.id),
  id: created?.id || null,
  code: testCode
});

if (created?.id) {
  const deleteResponse = await fetch(`${baseUrl}/api/suppliers/${created.id}`, { method: "DELETE" });
  const deletePayload = await deleteResponse.json();
  results.push({
    test: "DELETE logique fournisseur test",
    status: deleteResponse.status,
    pass: deleteResponse.status === 200,
    deletedAt: deletePayload.item?.deletedAt || deletePayload.supplier?.deletedAt || deletePayload.data?.deletedAt || deletePayload.deletedAt || null
  });
}

const folder = path.join(root, "public", "uploads", "assets", "LIT-KING-000002");
for (const name of await readdir(folder)) {
  const filePath = path.join(folder, name);
  const info = await stat(filePath);
  if (!info.isFile()) continue;
  const response = await fetch(`${baseUrl}/uploads/assets/LIT-KING-000002/${encodeURIComponent(name)}`);
  const body = await response.arrayBuffer();
  results.push({
    test: `GET fichier ${name}`,
    status: response.status,
    expectedBytes: info.size,
    receivedBytes: body.byteLength,
    pass: response.status === 200 && body.byteLength === info.size
  });
}

const outputRoot = path.join(root, "outputs", "migration", "sqlite-repair", "recipe");
await mkdir(outputRoot, { recursive: true });
const outputPath = path.join(outputRoot, "http-recipe-results.json");
await writeFile(outputPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl, results }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, results }, null, 2));
if (results.some((result) => !result.pass)) process.exitCode = 1;
