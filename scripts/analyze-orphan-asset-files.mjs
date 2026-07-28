import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const databasePath = path.resolve(root, process.argv[2] || "prisma/dev-repair-test.db");
const uploadsRoot = path.resolve(root, "public/uploads/assets");
const outputRoot = path.resolve(root, "outputs/migration/sqlite-repair");
const visualReview = {
  "LIT-KING-000002-8294b002-602f-4e5f-9d47-66fbb469e0ec-133828107271725621.jpg":
    "Paysage volcanique avec artefacts visuels; aucun lit ou bien mobilier identifiable.",
  "LIT-KING-000002-833c4964-8f75-4b4a-a13e-cdb6ab9aaca2-133879581908740101.jpg":
    "Photographie de canyon; aucun lit ou bien mobilier identifiable.",
  "LIT-KING-000002-f1b9b68c-989d-405e-9802-1c246e352791-133810434509723163.jpg":
    "Photographie d'un toucan; aucun lit ou bien mobilier identifiable."
};

async function filesBelow(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const absolute = path.join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(absolute));
    else if (entry.name !== ".gitkeep") result.push(absolute);
  }
  return result;
}

function detectMime(buffer) {
  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buffer.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  return "unknown";
}

const db = new DatabaseSync(databasePath, { readOnly: true });
db.exec("PRAGMA query_only = ON");
const files = [];
for (const filePath of await filesBelow(uploadsRoot)) {
  const relative = path.relative(uploadsRoot, filePath).replaceAll("\\", "/");
  const assetCode = relative.split("/")[0] || null;
  const bytes = await readFile(filePath);
  const info = await stat(filePath);
  const asset = assetCode ? db.prepare(
    `SELECT u.id, u.asset_code, u.serial_number, u.condition, u.status,
            i.id AS asset_item_id, i.name AS asset_item_name, i.code AS asset_item_code,
            l.id AS location_id, l.name AS location_name, l.code AS location_code
     FROM asset_units u
     JOIN asset_items i ON i.id = u.asset_item_id
     JOIN locations l ON l.id = u.location_id
     WHERE u.asset_code = ?`
  ).get(assetCode) : null;
  files.push({
    path: path.relative(root, filePath).replaceAll("\\", "/"),
    name: path.basename(filePath),
    size: info.size,
    mimeDetected: detectMime(bytes.subarray(0, 16)),
    sha256: createHash("sha256").update(bytes).digest("hex"),
    assetCodeFromPath: assetCode,
    matchingAsset: asset || null,
    visualReview: visualReview[path.basename(filePath)] || "Non revue visuellement.",
    proposedAttachment: null,
    proposedFileType: "OTHER",
    proposedIsPrimary: false,
    confidence: "faible",
    decision: "Laisser orphelin. Le chemin correspond à un bien existant, mais le contenu visuel ne représente pas ce bien; aucune métadonnée ne doit être créée sans confirmation humaine externe."
  });
}
db.close();

const report = {
  generatedAt: new Date().toISOString(),
  databasePath,
  readOnly: true,
  fileCount: files.length,
  files
};
await mkdir(outputRoot, { recursive: true });
const jsonPath = path.join(outputRoot, "orphan-files-analysis.json");
const markdownPath = path.join(outputRoot, "orphan-files-analysis.md");
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(markdownPath, [
  "# Analyse des fichiers locaux orphelins",
  "",
  `Base consultée en lecture seule : \`${databasePath}\``,
  "",
  ...files.flatMap((file, index) => [
    `## ${index + 1}. ${file.name}`,
    "",
    `- Chemin : \`${file.path}\``,
    `- Taille : ${file.size} octets`,
    `- MIME réel : \`${file.mimeDetected}\``,
    `- SHA-256 : \`${file.sha256}\``,
    `- Code extrait du chemin : \`${file.assetCodeFromPath}\``,
    `- Bien correspondant : ${file.matchingAsset ? `\`${file.matchingAsset.asset_code}\` — ${file.matchingAsset.asset_item_name}, ${file.matchingAsset.location_name}` : "aucun"}`,
    `- Revue visuelle : ${file.visualReview}`,
    `- Rattachement proposé : aucun à ce stade`,
    `- Type proposé si une confirmation externe impose le rattachement : \`${file.proposedFileType}\``,
    `- is_primary proposé : \`${file.proposedIsPrimary}\``,
    `- Confiance : **${file.confidence}**`,
    `- Décision : ${file.decision}`,
    ""
  ])
].join("\n"), "utf8");
console.log(JSON.stringify({ jsonPath, markdownPath, fileCount: files.length }, null, 2));
