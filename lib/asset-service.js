import { assertActiveDatabaseSchema, prisma } from "@/lib/prisma";
import { ensureEntryDraftDocument } from "@/lib/document-service";
import { generateAssetCodes, generateEntryNumber } from "@/lib/asset-codes";
import {
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  ENTRY_STATUSES,
  ENTRY_TYPES,
  INFORMATION_STATUSES,
  isAllowed
} from "@/lib/asset-constants";
import { writeAuditLog } from "@/lib/audit";
import { assertIndividualTrackingMode, assertQuantitativeTrackingMode } from "@/lib/asset-reference-foundation";

export function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIntOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizePriceFields({ quantity, unitPrice, totalPrice, priceKnown }) {
  const normalizedQuantity = Math.max(Number.parseInt(quantity, 10) || 1, 1);
  let normalizedUnitPrice = parseIntOrNull(unitPrice);
  let normalizedTotalPrice = parseIntOrNull(totalPrice);
  const known = priceKnown === true || priceKnown === "true" || normalizedUnitPrice !== null || normalizedTotalPrice !== null;

  if (!known) {
    return { unitPrice: null, totalPrice: null, priceKnown: false };
  }

  if (normalizedUnitPrice !== null && normalizedTotalPrice === null) {
    normalizedTotalPrice = normalizedUnitPrice * normalizedQuantity;
  }
  if (normalizedTotalPrice !== null && normalizedUnitPrice === null) {
    normalizedUnitPrice = Math.floor(normalizedTotalPrice / normalizedQuantity);
  }

  return {
    unitPrice: normalizedUnitPrice,
    totalPrice: normalizedTotalPrice,
    priceKnown: normalizedUnitPrice !== null || normalizedTotalPrice !== null
  };
}

export function validateEntryPayload(body) {
  const errors = [];
  const quantity = Number.parseInt(body.quantity, 10);

  if (!body.assetItemId) errors.push("assetItemId est obligatoire.");
  if (!body.locationId) errors.push("locationId est obligatoire.");
  if (!Number.isFinite(quantity) || quantity < 1) errors.push("quantity doit etre superieur ou egal a 1.");
  if (!body.entryType || !isAllowed(body.entryType, ENTRY_TYPES)) errors.push("entryType est invalide.");
  if (!body.entryDate || !parseDate(body.entryDate)) errors.push("entryDate est obligatoire.");
  if (!body.initialCondition || !isAllowed(body.initialCondition, ASSET_CONDITIONS)) errors.push("initialCondition est invalide.");
  if (!body.initialStatus || !isAllowed(body.initialStatus, ASSET_STATUSES)) errors.push("initialStatus est invalide.");
  if (body.entryStatus && !isAllowed(body.entryStatus, ENTRY_STATUSES)) errors.push("entryStatus est invalide.");
  if (body.informationStatus && !isAllowed(body.informationStatus, INFORMATION_STATUSES)) {
    errors.push("informationStatus est invalide.");
  }

  return errors;
}

export async function validateActiveReferentials(tx, { assetItemId, locationId, supplierId }) {
  const [assetItem, location, supplier] = await Promise.all([
    tx.assetItem.findFirst({
      where: { id: assetItemId, status: "ACTIVE", deletedAt: null },
      include: { category: { select: { hierarchyLevel: true, trackingMode: true, controlLevel: true, status: true, deletedAt: true } } }
    }),
    tx.location.findFirst({ where: { id: locationId, status: "ACTIVE", deletedAt: null } }),
    supplierId ? tx.supplier.findFirst({ where: { id: supplierId, status: "ACTIVE", deletedAt: null } }) : null
  ]);

  if (!assetItem) throw new Error("Article / modele actif introuvable.");
  if (!location) throw new Error("Emplacement actif introuvable.");
  if (supplierId && !supplier) throw new Error("Fournisseur actif introuvable.");

  return { assetItem, location, supplier };
}

export async function findPotentialAssetDuplicates(tx, { assetItemId, locationId, supplierId, serialNumber }) {
  const activeWhere = {
    deletedAt: null,
    status: { not: "RETIRED" }
  };
  const normalizedSerial = String(serialNumber || "").trim();

  const serialDuplicates = normalizedSerial
    ? await tx.assetUnit.findMany({
        where: { ...activeWhere, serialNumber: normalizedSerial },
        include: {
          assetItem: { select: { id: true, name: true, code: true } },
          location: { select: { id: true, name: true, code: true } },
          supplier: { select: { id: true, name: true, code: true } }
        },
        orderBy: { assetCode: "asc" }
      })
    : [];

  const similarUnits = await tx.assetUnit.findMany({
    where: {
      ...activeWhere,
      assetItemId,
      locationId,
      ...(supplierId ? { OR: [{ supplierId }, { supplierId: null }] } : {})
    },
    include: {
      assetItem: { select: { id: true, name: true, code: true } },
      location: { select: { id: true, name: true, code: true } },
      supplier: { select: { id: true, name: true, code: true } }
    },
    orderBy: { assetCode: "asc" }
  });

  return { serialDuplicates, similarUnits };
}

export function summarizeDuplicateUnit(unit) {
  return {
    id: unit.id,
    assetCode: unit.assetCode,
    serialNumber: unit.serialNumber,
    status: unit.status,
    condition: unit.condition,
    assetItem: unit.assetItem,
    location: unit.location,
    supplier: unit.supplier
  };
}

export async function createUnitsForValidatedEntry(tx, entry, actorId, { serialNumber = null, possibleDuplicate = false } = {}) {
  if (entry.entryStatus !== "VALIDATED") return [];

  const existingCount = await tx.assetUnit.count({ where: { entryId: entry.id } });
  if (existingCount > 0) {
    return tx.assetUnit.findMany({ where: { entryId: entry.id }, orderBy: { assetCode: "asc" } });
  }

  const assetItem = await tx.assetItem.findUnique({
    where: { id: entry.assetItemId },
    include: { category: { select: { hierarchyLevel: true, trackingMode: true, controlLevel: true } } }
  });
  assertIndividualTrackingMode(assetItem);
  const codes = await generateAssetCodes(tx, assetItem, entry.quantity, entry.entryDate);

  const data = codes.map((assetCode) => ({
    assetCode,
    assetItemId: entry.assetItemId,
    locationId: entry.locationId,
    supplierId: entry.supplierId,
    entryId: entry.id,
    serialNumber,
    condition: entry.initialCondition,
    status: entry.initialStatus,
    informationStatus: entry.informationStatus,
    purchaseDate: entry.purchaseDate,
    purchaseDateKnown: entry.purchaseDateKnown,
    unitPrice: entry.unitPrice,
    priceKnown: entry.priceKnown,
    supplierKnown: entry.supplierKnown,
    invoiceAvailable: entry.invoiceAvailable,
    invoiceReference: entry.invoiceReference,
    possibleDuplicate,
    notes: entry.notes,
    createdById: actorId,
    updatedById: actorId
  }));

  await tx.assetUnit.createMany({ data });
  return tx.assetUnit.findMany({ where: { entryId: entry.id }, orderBy: { assetCode: "asc" } });
}

export async function createAssetEntryWithUnits(body, actor) {
  const errors = validateEntryPayload(body);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const quantity = Number.parseInt(body.quantity, 10);
  const supplierId = body.supplierKnown === false || body.supplierKnown === "false" ? null : body.supplierId || null;
  const { assetItem } = await validateActiveReferentials(prisma, {
    assetItemId: body.assetItemId,
    locationId: body.locationId,
    supplierId
  });
  assertIndividualTrackingMode(assetItem);
  const prices = normalizePriceFields({
    quantity,
    unitPrice: body.unitPrice,
    totalPrice: body.totalPrice,
    priceKnown: body.priceKnown
  });
  const entryDate = parseDate(body.entryDate);
  const purchaseDateKnown = body.purchaseDateKnown === true || body.purchaseDateKnown === "true";
  const purchaseDate = purchaseDateKnown ? parseDate(body.purchaseDate) : null;
  const supplierKnown = body.supplierKnown === true || body.supplierKnown === "true" || Boolean(supplierId);
  const invoiceAvailable = body.invoiceAvailable === true || body.invoiceAvailable === "true";
  const serialNumber = String(body.serialNumber || "").trim() || null;
  const duplicateConfirmed = body.duplicateConfirmed === true || body.duplicateConfirmed === "true";
  const duplicateReason = String(body.duplicateReason || "").trim();
  const duplicateCheck = await findPotentialAssetDuplicates(prisma, {
    assetItemId: body.assetItemId,
    locationId: body.locationId,
    supplierId,
    serialNumber
  });
  if (duplicateCheck.serialDuplicates.length > 0) {
    throw new Error(
      `Numero de serie deja utilise par un bien actif : ${duplicateCheck.serialDuplicates
        .map((unit) => unit.assetCode)
        .join(", ")}.`
    );
  }
  const hasPossibleDuplicates = duplicateCheck.similarUnits.length > 0;
  if (hasPossibleDuplicates && (!duplicateConfirmed || !duplicateReason)) {
    const error = new Error("Doublon probable detecte : confirmation explicite et motif obligatoires.");
    error.code = "POSSIBLE_DUPLICATE";
    error.similarUnits = duplicateCheck.similarUnits.map(summarizeDuplicateUnit);
    throw error;
  }

  const entryStatus = body.entryStatus || "VALIDATED";
  const [entryNumber, assetCodes] = await Promise.all([
    generateEntryNumber(prisma, entryDate),
    entryStatus === "VALIDATED" ? generateAssetCodes(prisma, assetItem, quantity, entryDate) : []
  ]);
  const preparedEntry = {
    entryNumber,
    assetItemId: body.assetItemId,
    locationId: body.locationId,
    supplierId,
    quantity,
    entryType: body.entryType,
    entryDate,
    initialCondition: body.initialCondition,
    initialStatus: body.initialStatus,
    entryStatus,
    informationStatus: body.informationStatus || "PARTIAL",
    purchaseDate,
    purchaseDateKnown,
    supplierKnown,
    unitPrice: prices.unitPrice,
    totalPrice: prices.totalPrice,
    priceKnown: prices.priceKnown,
    invoiceAvailable,
    invoiceReference: invoiceAvailable ? body.invoiceReference || null : null,
    notes: body.notes || null,
    createdById: actor.id,
    updatedById: actor.id
  };

  const transactionStartedAt = Date.now();
  const transactionWriteCount = entryStatus === "VALIDATED" ? 2 : 1;
  const entry = await prisma.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    const created = await tx.assetEntry.create({ data: preparedEntry });
    if (entryStatus === "VALIDATED") {
      await tx.assetUnit.createMany({
        data: assetCodes.map((assetCode) => ({
          assetCode,
          assetItemId: created.assetItemId,
          locationId: created.locationId,
          supplierId: created.supplierId,
          entryId: created.id,
          serialNumber: quantity === 1 ? serialNumber : null,
          condition: created.initialCondition,
          status: created.initialStatus,
          informationStatus: created.informationStatus,
          purchaseDate: created.purchaseDate,
          purchaseDateKnown: created.purchaseDateKnown,
          unitPrice: created.unitPrice,
          priceKnown: created.priceKnown,
          supplierKnown: created.supplierKnown,
          invoiceAvailable: created.invoiceAvailable,
          invoiceReference: created.invoiceReference,
          possibleDuplicate: hasPossibleDuplicates,
          notes: created.notes,
          createdById: actor.id,
          updatedById: actor.id
        }))
      });
    }
    return created;
  }, { maxWait: 10000, timeout: 30000 });
  console.info(JSON.stringify({
    event: "asset_entry_transaction_completed",
    maxWaitMs: 10000,
    timeoutMs: 30000,
    writeQueries: transactionWriteCount,
    durationMs: Date.now() - transactionStartedAt
  }));

  const units = await prisma.assetUnit.findMany({ where: { entryId: entry.id }, orderBy: { assetCode: "asc" } });
  return {
    entry,
    units,
    duplicateWarning: hasPossibleDuplicates
      ? {
          confirmed: true,
          reason: duplicateReason,
          similarUnits: duplicateCheck.similarUnits.map(summarizeDuplicateUnit)
        }
      : null
  };
}

function assertStrictPositiveInteger(value) {
  if (!/^[1-9]\d*$/.test(String(value ?? "").trim())) {
    const error = new Error("La quantité quantitative doit être un entier strictement positif.");
    error.status = 400;
    throw error;
  }
  return Number(value);
}

function preparedEntryData(body, actor, { quantity, supplierId, entryNumber, entryStatus = "VALIDATED" }) {
  const prices = normalizePriceFields({ quantity, unitPrice: body.unitPrice, totalPrice: body.totalPrice, priceKnown: body.priceKnown });
  const purchaseDateKnown = body.purchaseDateKnown === true || body.purchaseDateKnown === "true";
  const supplierKnown = body.supplierKnown === true || body.supplierKnown === "true" || Boolean(supplierId);
  const invoiceAvailable = body.invoiceAvailable === true || body.invoiceAvailable === "true";
  return {
    entryNumber, assetItemId: body.assetItemId, locationId: body.locationId, supplierId, quantity,
    entryType: body.entryType, entryDate: parseDate(body.entryDate), initialCondition: body.initialCondition,
    initialStatus: body.initialStatus, entryStatus, informationStatus: body.informationStatus || "PARTIAL",
    purchaseDate: purchaseDateKnown ? parseDate(body.purchaseDate) : null, purchaseDateKnown, supplierKnown,
    unitPrice: prices.unitPrice, totalPrice: prices.totalPrice, priceKnown: prices.priceKnown, invoiceAvailable,
    invoiceReference: invoiceAvailable ? body.invoiceReference || null : null, notes: body.notes || null,
    createdById: actor.id, updatedById: actor.id
  };
}

export async function createQuantitativeAssetEntryWithPosition(body, actor, { prismaClient = prisma, createPosition } = {}) {
  const errors = validateEntryPayload(body);
  if (errors.length > 0) throw new Error(errors.join(" "));
  const quantity = assertStrictPositiveInteger(body.quantity);
  const supplierId = body.supplierKnown === false || body.supplierKnown === "false" ? null : body.supplierId || null;
  const entryStatus = body.entryStatus || "VALIDATED";
  if (entryStatus !== "VALIDATED") {
    const error = new Error("Une entrée quantitative doit être validée pour créer sa position initiale.");
    error.status = 400;
    throw error;
  }
  return prismaClient.$transaction(async (tx) => {
    await assertActiveDatabaseSchema(tx);
    const { assetItem } = await validateActiveReferentials(tx, { assetItemId: body.assetItemId, locationId: body.locationId, supplierId });
    const trackingMode = assertQuantitativeTrackingMode(assetItem, ["Q", "QI"]);
    const entryNumber = await generateEntryNumber(tx, parseDate(body.entryDate));
    const entry = await tx.assetEntry.create({ data: preparedEntryData(body, actor, { quantity, supplierId, entryNumber }) });
    const position = await (createPosition
      ? createPosition(tx, { assetEntryId: entry.id, locationId: entry.locationId, availableQuantity: quantity, createdById: actor.id, updatedById: actor.id })
      : tx.quantitativeStockPosition.create({ data: { assetEntryId: entry.id, locationId: entry.locationId, availableQuantity: quantity, createdById: actor.id, updatedById: actor.id } }));
    return { entry, quantitativePosition: position, units: [], duplicateWarning: null, trackingMode };
  }, { maxWait: 10000, timeout: 30000 });
}

export async function createAssetEntryByTrackingMode(body, actor) {
  const assetItem = await prisma.assetItem.findFirst({
    where: { id: body.assetItemId, status: "ACTIVE", deletedAt: null },
    include: { category: { select: { trackingMode: true } } }
  });
  if (["Q", "QI"].includes(assetItem?.category?.trackingMode)) return createQuantitativeAssetEntryWithPosition(body, actor);
  return createAssetEntryWithUnits(body, actor);
}

export async function auditEntryCreation({ entry, units, actor, duplicateWarning, quantitativePosition = null }) {
  await writeAuditLog({
    action: "ASSET_ENTRY_CREATED",
    entityTable: "asset_entries",
    entityId: entry.id,
    summary: `Creation de l'entree ${entry.entryNumber}`,
    metadata: { quantity: entry.quantity, entryStatus: entry.entryStatus },
    userId: actor.id
  });

  if (quantitativePosition) {
    await writeAuditLog({
      action: "QUANTITATIVE_STOCK_POSITION_CREATED", entityTable: "quantitative_stock_positions", entityId: quantitativePosition.id,
      summary: `Création du stock quantitatif de ${entry.entryNumber}`,
      metadata: { entryId: entry.id, locationId: quantitativePosition.locationId, availableQuantity: quantitativePosition.availableQuantity }, userId: actor.id
    });
  } else if (entry.entryStatus === "VALIDATED") {
    await writeAuditLog({
      action: units.length > 1 ? "ASSET_UNITS_BATCH_CREATED" : "ASSET_UNIT_CREATED",
      entityTable: "asset_entries",
      entityId: entry.id,
      summary: `Creation de ${units.length} bien(s) depuis ${entry.entryNumber}`,
      metadata: { assetCodes: units.map((unit) => unit.assetCode) },
      userId: actor.id
    });
  }

  if (entry.entryStatus === "VALIDATED" && duplicateWarning) {
    await writeAuditLog({
      action: "ASSET_UNIT_CREATED_WITH_DUPLICATE_WARNING",
      entityTable: "asset_entries",
      entityId: entry.id,
      summary: `Creation maintenue malgre alerte doublon probable pour ${entry.entryNumber}`,
      metadata: {
        reason: duplicateWarning.reason,
        similarAssetCodes: duplicateWarning.similarUnits.map((unit) => unit.assetCode)
      },
      userId: actor.id
    });
  }
}

function entryWorkflowError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function draftPayload(current, body) {
  return {
    assetItemId: body.assetItemId ?? current?.assetItemId,
    locationId: body.locationId ?? current?.locationId,
    supplierId: body.supplierId !== undefined ? body.supplierId : current?.supplierId,
    supplierKnown: body.supplierKnown !== undefined ? body.supplierKnown : current?.supplierKnown,
    quantity: body.quantity ?? current?.quantity,
    entryType: body.entryType ?? current?.entryType,
    entryDate: body.entryDate ?? current?.entryDate,
    initialCondition: body.initialCondition ?? current?.initialCondition,
    initialStatus: body.initialStatus ?? current?.initialStatus,
    informationStatus: body.informationStatus ?? current?.informationStatus ?? "PARTIAL",
    purchaseDate: body.purchaseDate !== undefined ? body.purchaseDate : current?.purchaseDate,
    purchaseDateKnown: body.purchaseDateKnown !== undefined ? body.purchaseDateKnown : current?.purchaseDateKnown,
    unitPrice: body.unitPrice !== undefined ? body.unitPrice : current?.unitPrice,
    totalPrice: body.totalPrice !== undefined ? body.totalPrice : current?.totalPrice,
    priceKnown: body.priceKnown !== undefined ? body.priceKnown : current?.priceKnown,
    invoiceAvailable: body.invoiceAvailable !== undefined ? body.invoiceAvailable : current?.invoiceAvailable,
    invoiceReference: body.invoiceReference !== undefined ? body.invoiceReference : current?.invoiceReference,
    notes: body.notes !== undefined ? body.notes : current?.notes
  };
}

function quantityForTrackingMode(value, trackingMode) {
  if (["Q", "QI"].includes(trackingMode)) return assertStrictPositiveInteger(value);
  const quantity = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw entryWorkflowError("INVALID_ENTRY_QUANTITY", "quantity doit etre superieur ou egal a 1.");
  return quantity;
}

function assertOperationalEntryMode(assetItem) {
  const trackingMode = assetItem?.category?.trackingMode;
  if (trackingMode === "I") assertIndividualTrackingMode(assetItem);
  else assertQuantitativeTrackingMode(assetItem, ["Q", "QI"]);
  return trackingMode;
}

export function computeAssetEntryProgress(entry) {
  const identification = Boolean(entry?.assetItemId && Number(entry?.quantity) > 0 && entry?.entryType && parseDate(entry?.entryDate));
  const assignment = Boolean(entry?.locationId && entry?.initialCondition && entry?.initialStatus);
  const files = entry?._count?.assetFiles ?? entry?.assetFiles?.filter((file) => !file.deletedAt).length ?? 0;
  const finances = Boolean(entry?.supplierKnown || entry?.purchaseDateKnown || entry?.priceKnown || entry?.invoiceAvailable);
  return { identification, assignment, photosDocuments: files, finances, readyToValidate: identification && assignment };
}

export async function createAssetEntryDraft(body, actor, {
  prismaClient = prisma,
  assertSchema = assertActiveDatabaseSchema,
  audit = writeAuditLog
} = {}) {
  const errors = validateEntryPayload({ ...body, entryStatus: "DRAFT" });
  if (errors.length) throw entryWorkflowError("INVALID_ENTRY_DRAFT", errors.join(" "));

  const result = await prismaClient.$transaction(async (tx) => {
    await assertSchema(tx);
    const supplierId = body.supplierKnown === false || body.supplierKnown === "false" ? null : body.supplierId || null;
    const { assetItem } = await validateActiveReferentials(tx, { assetItemId: body.assetItemId, locationId: body.locationId, supplierId });
    const trackingMode = assertOperationalEntryMode(assetItem);
    const quantity = quantityForTrackingMode(body.quantity, trackingMode);
    const entryNumber = await generateEntryNumber(tx, parseDate(body.entryDate));
    const entry = await tx.assetEntry.create({
      data: preparedEntryData(body, actor, { quantity, supplierId, entryNumber, entryStatus: "DRAFT" })
    });
    return { entry, trackingMode, units: [], quantitativePosition: null, progress: computeAssetEntryProgress(entry) };
  });

  await audit({
    action: "ASSET_ENTRY_DRAFT_CREATED",
    entityTable: "asset_entries",
    entityId: result.entry.id,
    summary: `Brouillon d'entree ${result.entry.entryNumber} cree`,
    metadata: { entryStatus: "DRAFT", trackingMode: result.trackingMode },
    userId: actor.id
  });
  return result;
}

export async function updateAssetEntryDraft(id, body, actor, {
  prismaClient = prisma,
  assertSchema = assertActiveDatabaseSchema,
  audit = writeAuditLog
} = {}) {
  const result = await prismaClient.$transaction(async (tx) => {
    await assertSchema(tx);
    const current = await tx.assetEntry.findUnique({ where: { id } });
    if (!current) throw entryWorkflowError("ENTRY_NOT_FOUND", "Entree introuvable.", 404);
    if (current.entryStatus === "VALIDATED") throw entryWorkflowError("ENTRY_ALREADY_VALIDATED", "Une entree validee ne peut plus etre modifiee comme brouillon.", 409);
    if (current.entryStatus !== "DRAFT") throw entryWorkflowError("ENTRY_NOT_EDITABLE", "Cette entree n'est plus modifiable.", 409);

    const payload = draftPayload(current, body);
    const errors = validateEntryPayload({ ...payload, entryStatus: "DRAFT" });
    if (errors.length) throw entryWorkflowError("INVALID_ENTRY_DRAFT", errors.join(" "));
    const supplierId = payload.supplierKnown === false || payload.supplierKnown === "false" ? null : payload.supplierId || null;
    const { assetItem } = await validateActiveReferentials(tx, { assetItemId: payload.assetItemId, locationId: payload.locationId, supplierId });
    const trackingMode = assertOperationalEntryMode(assetItem);
    const quantity = quantityForTrackingMode(payload.quantity, trackingMode);
    const prepared = preparedEntryData(payload, actor, { quantity, supplierId, entryNumber: current.entryNumber, entryStatus: "DRAFT" });
    const { entryNumber: _entryNumber, entryStatus: _entryStatus, createdById: _createdById, ...data } = prepared;
    const entry = await tx.assetEntry.update({ where: { id }, data: { ...data, updatedById: actor.id } });
    return { entry, trackingMode, progress: computeAssetEntryProgress(entry) };
  });

  await audit({
    action: "ASSET_ENTRY_DRAFT_UPDATED",
    entityTable: "asset_entries",
    entityId: result.entry.id,
    summary: `Brouillon d'entree ${result.entry.entryNumber} mis a jour`,
    metadata: { entryStatus: "DRAFT", trackingMode: result.trackingMode },
    userId: actor.id
  });
  return result;
}

export async function validateAssetEntryDraft(id, actor, validation = {}, {
  prismaClient = prisma,
  assertSchema = assertActiveDatabaseSchema,
  ensureDocument = ensureEntryDraftDocument
} = {}) {
  return prismaClient.$transaction(async (tx) => {
    await assertSchema(tx);
    const current = await tx.assetEntry.findUnique({ where: { id } });
    if (!current) throw entryWorkflowError("ENTRY_NOT_FOUND", "Entree introuvable.", 404);
    if (current.entryStatus === "VALIDATED") throw entryWorkflowError("ENTRY_ALREADY_VALIDATED", "Cette entree est deja validee.", 409);
    if (current.entryStatus !== "DRAFT") throw entryWorkflowError("ENTRY_NOT_VALIDATABLE", "Cette entree ne peut pas etre validee.", 409);

    const errors = validateEntryPayload(current);
    if (errors.length) throw entryWorkflowError("INVALID_ENTRY_DRAFT", errors.join(" "));
    const { assetItem } = await validateActiveReferentials(tx, {
      assetItemId: current.assetItemId,
      locationId: current.locationId,
      supplierId: current.supplierId
    });
    const trackingMode = assertOperationalEntryMode(assetItem);
    const [unitCount, positionCount] = await Promise.all([
      tx.assetUnit.count({ where: { entryId: id } }),
      tx.quantitativeStockPosition.count({ where: { assetEntryId: id } })
    ]);
    if (unitCount || positionCount) throw entryWorkflowError("ENTRY_DRAFT_HAS_PATRIMONY", "Le brouillon possede deja un effet patrimonial incoherent.", 409);

    const claimed = await tx.assetEntry.updateMany({
      where: { id, entryStatus: "DRAFT" },
      data: { entryStatus: "VALIDATED", updatedById: actor.id }
    });
    if (claimed.count !== 1) throw entryWorkflowError("ENTRY_ALREADY_VALIDATED", "Cette entree a deja ete validee.", 409);

    const validatedEntry = { ...current, entryStatus: "VALIDATED", updatedById: actor.id };
    let units = [];
    let quantitativePosition = null;
    if (trackingMode === "I") {
      const duplicateCheck = await findPotentialAssetDuplicates(tx, {
        assetItemId: current.assetItemId,
        locationId: current.locationId,
        supplierId: current.supplierId,
        serialNumber: validation.serialNumber
      });
      if (duplicateCheck.serialDuplicates.length) throw entryWorkflowError("DUPLICATE_SERIAL_NUMBER", "Numero de serie deja utilise par un bien actif.", 409);
      const possibleDuplicate = duplicateCheck.similarUnits.length > 0;
      if (possibleDuplicate && !(validation.duplicateConfirmed && String(validation.duplicateReason || "").trim())) {
        throw entryWorkflowError("POSSIBLE_DUPLICATE", "Doublon probable detecte : confirmation explicite et motif obligatoires.", 409);
      }
      units = await createUnitsForValidatedEntry(tx, validatedEntry, actor.id, {
        serialNumber: current.quantity === 1 ? String(validation.serialNumber || "").trim() || null : null,
        possibleDuplicate
      });
    } else {
      quantitativePosition = await tx.quantitativeStockPosition.create({
        data: {
          assetEntryId: id,
          locationId: current.locationId,
          availableQuantity: current.quantity,
          createdById: actor.id,
          updatedById: actor.id
        }
      });
    }

    const entrySlipResult = await ensureDocument(tx, id, actor);
    await tx.auditLog.create({
      data: {
        action: "ASSET_ENTRY_VALIDATED",
        entityTable: "asset_entries",
        entityId: id,
        summary: `Validation de l'entree ${current.entryNumber}`,
        metadata: JSON.stringify({ trackingMode, units: units.length, quantitativePositionId: quantitativePosition?.id || null }),
        userId: actor.id
      }
    });
    return { entry: validatedEntry, trackingMode, units, quantitativePosition, entrySlip: entrySlipResult.document, progress: computeAssetEntryProgress(validatedEntry) };
  }, { maxWait: 10000, timeout: 30000 });
}
