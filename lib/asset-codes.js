function yearFrom(date = new Date()) {
  return new Date(date).getFullYear();
}

export function normalizeAssetPrefix(assetItem) {
  const rawCode = String(assetItem?.code || "").trim().toUpperCase();
  const withoutGenericPrefix = rawCode.startsWith("ITEM-") ? rawCode.slice(5) : rawCode;
  const normalized = withoutGenericPrefix
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return normalized.length >= 3 ? normalized : null;
}

function extractSequence(code, prefix) {
  const match = String(code).match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d{6})$`));
  return match ? Number.parseInt(match[1], 10) : 0;
}

export async function generateAssetCodes(tx, assetItem, quantity, date = new Date()) {
  const prefix = normalizeAssetPrefix(assetItem) || `IMMO-${yearFrom(date)}`;
  const existing = await tx.assetUnit.findMany({
    where: { assetCode: { startsWith: `${prefix}-` } },
    select: { assetCode: true }
  });
  const max = existing.reduce((current, item) => Math.max(current, extractSequence(item.assetCode, prefix)), 0);

  return Array.from({ length: quantity }, (_value, index) => {
    const sequence = String(max + index + 1).padStart(6, "0");
    return `${prefix}-${sequence}`;
  });
}

export async function generateEntryNumber(tx, date = new Date()) {
  const prefix = `ENT-${yearFrom(date)}`;
  const existing = await tx.assetEntry.findMany({
    where: { entryNumber: { startsWith: `${prefix}-` } },
    select: { entryNumber: true }
  });
  const max = existing.reduce((current, item) => Math.max(current, extractSequence(item.entryNumber, prefix)), 0);
  return `${prefix}-${String(max + 1).padStart(6, "0")}`;
}
