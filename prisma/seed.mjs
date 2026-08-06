import { PrismaClient } from "../generated/prisma-lot6/index.js";
import { generateAssetCodes } from "../lib/asset-codes.js";

const prisma = new PrismaClient();

async function upsertAssetItemByCodeOrName({ code, legacyCode, name, description, unitLabel, categoryId, supplierId, userId }) {
  const existing = await prisma.assetItem.findFirst({
    where: {
      OR: [{ code }, { code: legacyCode }, { name }]
    }
  });

  if (existing) {
    return prisma.assetItem.update({
      where: { id: existing.id },
      data: {
        code,
        name,
        description,
        unitLabel,
        categoryId,
        supplierId,
        updatedById: userId
      }
    });
  }

  return prisma.assetItem.create({
    data: {
      code,
      name,
      description,
      unitLabel,
      categoryId,
      supplierId,
      status: "ACTIVE",
      createdById: userId,
      updatedById: userId
    }
  });
}

async function seedValidatedEntry({ entryNumber, assetItemCode, locationCode, quantity, initialCondition, initialStatus, informationStatus, supplierCode, priceKnown, unitPrice, totalPrice, purchaseDateKnown, supplierKnown, invoiceAvailable, notes, userId }) {
  const existingEntry = await prisma.assetEntry.findUnique({ where: { entryNumber } });
  if (existingEntry) return existingEntry;

  const assetItem = await prisma.assetItem.findUnique({ where: { code: assetItemCode } });
  const location = await prisma.location.findUnique({ where: { code: locationCode } });
  const supplier = supplierCode ? await prisma.supplier.findUnique({ where: { code: supplierCode } }) : null;

  if (!assetItem || !location) {
    throw new Error(`Seed Lot 3 impossible pour ${entryNumber}: article ou emplacement introuvable.`);
  }

  const entry = await prisma.assetEntry.create({
    data: {
      entryNumber,
      assetItemId: assetItem.id,
      locationId: location.id,
      supplierId: supplier?.id || null,
      quantity,
      entryType: "PROGRESSIVE_INVENTORY",
      entryDate: new Date("2026-06-01T00:00:00.000Z"),
      initialCondition,
      initialStatus,
      entryStatus: "VALIDATED",
      informationStatus,
      purchaseDate: purchaseDateKnown ? new Date("2025-12-15T00:00:00.000Z") : null,
      purchaseDateKnown,
      supplierKnown,
      unitPrice: priceKnown ? unitPrice : null,
      totalPrice: priceKnown ? totalPrice || unitPrice * quantity : null,
      priceKnown,
      invoiceAvailable,
      invoiceReference: invoiceAvailable ? `${entryNumber}-FAC` : null,
      notes,
      createdById: userId,
      updatedById: userId
    }
  });

  const codes = await generateAssetCodes(prisma, assetItem, quantity, entry.entryDate);
  await prisma.assetUnit.createMany({
    data: codes.map((assetCode) => ({
      assetCode,
      assetItemId: assetItem.id,
      locationId: location.id,
      supplierId: supplier?.id || null,
      entryId: entry.id,
      condition: initialCondition,
      status: initialStatus,
      informationStatus,
      purchaseDate: purchaseDateKnown ? new Date("2025-12-15T00:00:00.000Z") : null,
      purchaseDateKnown,
      unitPrice: priceKnown ? unitPrice : null,
      priceKnown,
      supplierKnown,
      invoiceAvailable,
      invoiceReference: invoiceAvailable ? `${entryNumber}-FAC` : null,
      notes,
      createdById: userId,
      updatedById: userId
    }))
  });

  return entry;
}

async function seedDocumentFromEntries({ documentNumber, documentType, title, status, entryNumbers, userId }) {
  const existingDocument = await prisma.assetDocument.findUnique({ where: { documentNumber } });
  if (existingDocument) return existingDocument;

  const entries = await prisma.assetEntry.findMany({
    where: { entryNumber: { in: entryNumbers } },
    include: {
      assetItem: true,
      location: true,
      assetUnits: true
    }
  });

  if (entries.length !== entryNumbers.length) {
    throw new Error(`Seed Lot 4 impossible pour ${documentNumber}: entree introuvable.`);
  }

  if (status !== "CANCELLED") {
    const entryIds = entries.map((entry) => entry.id);
    const unitIds = entries.flatMap((entry) => entry.assetUnits.map((unit) => unit.id));
    const entryConflict = await prisma.assetDocumentEntry.findFirst({
      where: {
        assetEntryId: { in: entryIds },
        document: {
          documentType,
          status: { in: ["DRAFT", "VALIDATED"] }
        }
      }
    });
    const unitConflict = documentType === "ENTRY_SLIP" ? await prisma.assetDocumentLine.findFirst({
      where: {
        assetUnitId: { in: unitIds },
        document: {
          documentType,
          status: { in: ["DRAFT", "VALIDATED"] }
        }
      }
    }) : null;

    if (entryConflict || unitConflict) return null;
  }

  const document = await prisma.assetDocument.create({
    data: {
      documentNumber,
      documentType,
      documentDate: new Date("2026-06-01T00:00:00.000Z"),
      title,
      status,
      notes: "Seed Lot 4 - document chronologique structure.",
      createdById: userId,
      updatedById: userId,
      validatedById: status === "VALIDATED" ? userId : null,
      validatedAt: status === "VALIDATED" ? new Date("2026-06-01T08:00:00.000Z") : null,
      cancelledById: status === "CANCELLED" ? userId : null,
      cancelledAt: status === "CANCELLED" ? new Date("2026-06-01T08:30:00.000Z") : null,
      cancellationReason: status === "CANCELLED" ? "Document seed annule avec motif conserve sur la fiche." : null
    }
  });

  await prisma.assetDocumentEntry.createMany({
    data: entries.map((entry) => ({
      documentId: document.id,
      assetEntryId: entry.id
    }))
  });

  const seenUnits = new Set();
  const lines = [];
  for (const entry of entries) {
    for (const unit of entry.assetUnits) {
      if (seenUnits.has(unit.id)) continue;
      seenUnits.add(unit.id);
      lines.push({
        documentId: document.id,
        assetEntryId: entry.id,
        assetUnitId: unit.id,
        assetItemId: entry.assetItemId,
        locationId: entry.locationId,
        quantity: 1,
        lineLabel: `${unit.assetCode} - ${entry.assetItem.name}`,
        lineNotes: entry.location?.name || null
      });
    }
  }

  if (lines.length > 0) {
    await prisma.assetDocumentLine.createMany({ data: lines });
  }

  return document;
}

async function seedMovement({ movementNumber, movementType, movementStatus, assetCodes, toLocationCode, reason, userId }) {
  const existing = await prisma.assetMovement.findUnique({ where: { movementNumber } });
  if (existing) return existing;

  const units = await prisma.assetUnit.findMany({
    where: { assetCode: { in: assetCodes } },
    include: { location: true }
  });
  const toLocation = await prisma.location.findUnique({ where: { code: toLocationCode } });
  if (units.length !== assetCodes.length || !toLocation) {
    return null;
  }

  const movement = await prisma.assetMovement.create({
    data: {
      movementNumber,
      movementType,
      movementStatus,
      movementDate: new Date("2026-06-01T00:00:00.000Z"),
      reason,
      notes: "Seed Lot 5 - mouvement de test.",
      createdById: userId,
      updatedById: userId,
      validatedById: movementStatus === "VALIDATED" ? userId : null,
      validatedAt: movementStatus === "VALIDATED" ? new Date("2026-06-01T10:00:00.000Z") : null,
      lines: {
        create: units.map((unit) => ({
          assetUnitId: unit.id,
          fromLocationId: unit.locationId,
          toLocationId: toLocation.id,
          lineNotes: "Seed Lot 5"
        }))
      }
    },
    include: { lines: true }
  });

  if (movementStatus === "VALIDATED") {
    for (const unit of units) {
      await prisma.assetUnit.update({
        where: { id: unit.id },
        data: { locationId: toLocation.id, updatedById: userId }
      });
    }
  }

  return movement;
}

async function main() {
  const direction = await prisma.user.upsert({
    where: { email: "direction@laresidence.local" },
    update: {},
    create: {
      email: "direction@laresidence.local",
      name: "Direction",
      role: "DIRECTION",
      status: "ACTIVE",
      authProvider: "local-seed"
    }
  });

  const users = [
    {
      email: "inventaire@laresidence.local",
      name: "Responsable inventaire",
      role: "INVENTORY_MANAGER"
    },
    {
      email: "maintenance@laresidence.local",
      name: "Responsable maintenance",
      role: "MAINTENANCE_MANAGER"
    },
    {
      email: "utilisateur@laresidence.local",
      name: "Utilisateur simple",
      role: "BASIC_USER"
    }
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: {
        ...user,
        status: "ACTIVE",
        authProvider: "local-seed",
        createdById: direction.id,
        updatedById: direction.id
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "SEED_LOT_1",
      entityTable: "users",
      entityId: direction.id,
      summary: "Creation des utilisateurs et roles de test du Lot 1",
      metadata: JSON.stringify({ lot: 1 }),
      userId: direction.id
    }
  });

  const suppliers = [
    {
      code: "SUP-MOB",
      name: "Fournisseur mobilier",
      supplierType: "Mobilier",
      contactName: "Service commercial",
      email: "mobilier@fournisseur.local",
      phone: "+33 1 00 00 00 01"
    },
    {
      code: "SUP-MAINT",
      name: "Fournisseur maintenance",
      supplierType: "Maintenance",
      contactName: "Support technique",
      email: "maintenance@fournisseur.local",
      phone: "+33 1 00 00 00 02"
    },
    {
      code: "SUP-IT",
      name: "Fournisseur informatique",
      supplierType: "Informatique",
      contactName: "Equipe IT",
      email: "it@fournisseur.local",
      phone: "+33 1 00 00 00 03"
    }
  ];

  for (const supplier of suppliers) {
    await prisma.supplier.upsert({
      where: { code: supplier.code },
      update: {},
      create: {
        ...supplier,
        status: "ACTIVE",
        createdById: direction.id,
        updatedById: direction.id
      }
    });
  }

  const site = await prisma.location.upsert({
    where: { code: "RES-PRINCIPALE" },
    update: {},
    create: {
      code: "RES-PRINCIPALE",
      name: "Residence principale",
      locationType: "Site",
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  const floor = await prisma.location.upsert({
    where: { code: "ETAGE-1" },
    update: {},
    create: {
      code: "ETAGE-1",
      name: "Etage 1",
      locationType: "Etage",
      parentId: site.id,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  await prisma.location.upsert({
    where: { code: "CH-101" },
    update: {},
    create: {
      code: "CH-101",
      name: "Chambre 101",
      locationType: "Chambre",
      parentId: floor.id,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  await prisma.location.upsert({
    where: { code: "LOCAL-TECH" },
    update: {},
    create: {
      code: "LOCAL-TECH",
      name: "Local technique",
      locationType: "Stockage",
      parentId: site.id,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  const roomEquipment = await prisma.assetCategory.upsert({
    where: { code: "CAT-CHAMBRES" },
    update: {},
    create: {
      code: "CAT-CHAMBRES",
      name: "Materiel chambres",
      description: "Equipements et mobilier rattaches aux chambres.",
      displayOrder: 10,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  const furniture = await prisma.assetCategory.upsert({
    where: { code: "CAT-MOBILIER" },
    update: {},
    create: {
      code: "CAT-MOBILIER",
      name: "Mobilier",
      description: "Mobilier utilise dans les chambres et espaces communs.",
      parentId: roomEquipment.id,
      displayOrder: 20,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  const beds = await prisma.assetCategory.upsert({
    where: { code: "CAT-LITS" },
    update: {},
    create: {
      code: "CAT-LITS",
      name: "Lits",
      description: "Modeles de lits. Les unites physiques seront creees dans un lot ulterieur.",
      parentId: furniture.id,
      displayOrder: 30,
      status: "ACTIVE",
      createdById: direction.id,
      updatedById: direction.id
    }
  });

  const defaultBedSupplier = await prisma.supplier.findUnique({ where: { code: "SUP-MOB" } });
  const bedItems = [
    ["LIT-KING", "ITEM-LIT-KING", "Lit King size", "1,80 m x 2,00 m"],
    ["LIT-QUEEN", "ITEM-LIT-QUEEN", "Lit Queen size", "1,60 m x 2,00 m"],
    ["LIT-STANDARD", "ITEM-LIT-STANDARD", "Lit Standard", "1,40 m x 2,00 m"],
    ["LIT-SINGLE-100", "ITEM-LIT-SINGLE-LARGE", "Lit Single large", "1,00 m x 2,00 m"],
    ["LIT-SINGLE-090", "ITEM-LIT-SINGLE-SIMPLE", "Lit Single simple", "0,90 m x 2,00 m"]
  ];

  for (const [code, legacyCode, name, size] of bedItems) {
    await upsertAssetItemByCodeOrName({
      code,
      legacyCode,
      name,
      description: size,
      unitLabel: "modele",
      categoryId: beds.id,
      supplierId: defaultBedSupplier?.id || null,
      userId: direction.id
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "SEED_LOT_2",
      entityTable: "asset_items",
      entityId: beds.id,
      summary: "Creation des referentiels communs et modeles de lits du Lot 2",
      metadata: JSON.stringify({ lot: 2, assetUnitsCreated: 0 }),
      userId: direction.id
    }
  });

  await seedValidatedEntry({
    entryNumber: "ENT-2026-000001",
    assetItemCode: "LIT-QUEEN",
    locationCode: "CH-101",
    quantity: 2,
    initialCondition: "VERY_GOOD",
    initialStatus: "IN_SERVICE",
    informationStatus: "COMPLETE",
    supplierCode: "SUP-MOB",
    priceKnown: true,
    unitPrice: 1250000,
    purchaseDateKnown: true,
    supplierKnown: true,
    invoiceAvailable: true,
    notes: "Seed Lot 3 - deux lits Queen en chambre 101.",
    userId: direction.id
  });

  await seedValidatedEntry({
    entryNumber: "ENT-2026-000002",
    assetItemCode: "LIT-SINGLE-090",
    locationCode: "LOCAL-TECH",
    quantity: 1,
    initialCondition: "GOOD",
    initialStatus: "IN_STOCK",
    informationStatus: "PARTIAL",
    supplierCode: "SUP-MOB",
    priceKnown: false,
    unitPrice: null,
    purchaseDateKnown: false,
    supplierKnown: true,
    invoiceAvailable: false,
    notes: "Seed Lot 3 - prix et date d'achat inconnus.",
    userId: direction.id
  });

  await seedValidatedEntry({
    entryNumber: "ENT-2026-000003",
    assetItemCode: "LIT-STANDARD",
    locationCode: "CH-101",
    quantity: 1,
    initialCondition: "FAIR",
    initialStatus: "IN_SERVICE",
    informationStatus: "TO_COMPLETE",
    supplierCode: null,
    priceKnown: false,
    unitPrice: null,
    purchaseDateKnown: false,
    supplierKnown: false,
    invoiceAvailable: false,
    notes: "Seed Lot 3 - fournisseur inconnu, informations a completer.",
    userId: direction.id
  });

  await prisma.auditLog.create({
    data: {
      action: "SEED_LOT_3",
      entityTable: "asset_entries",
      entityId: "ENT-2026-000001",
      summary: "Creation des entrees progressives et biens physiques de test du Lot 3",
      metadata: JSON.stringify({ lot: 3 }),
      userId: direction.id
    }
  });

  await seedDocumentFromEntries({
    documentNumber: "BE-2026-000001",
    documentType: "ENTRY_SLIP",
    title: "Bon d'entree - regroupement seed Lot 4",
    status: "VALIDATED",
    entryNumbers: ["ENT-2026-000001", "ENT-2026-000002"],
    userId: direction.id
  });

  await seedDocumentFromEntries({
    documentNumber: "DOC-2026-000001",
    documentType: "PROGRESSIVE_INVENTORY_SHEET",
    title: "Fiche d'inventaire progressif - chambre 101",
    status: "DRAFT",
    entryNumbers: ["ENT-2026-000003"],
    userId: direction.id
  });

  await prisma.auditLog.create({
    data: {
      action: "SEED_LOT_4",
      entityTable: "asset_documents",
      entityId: "BE-2026-000001",
      summary: "Creation des documents chronologiques structures de test du Lot 4",
      metadata: JSON.stringify({ lot: 4, documentTypesUsed: ["ENTRY_SLIP", "PROGRESSIVE_INVENTORY_SHEET"] }),
      userId: direction.id
    }
  });

  await seedMovement({
    movementNumber: "MVT-2026-000001",
    movementType: "ASSIGNMENT",
    movementStatus: "VALIDATED",
    assetCodes: ["LIT-STANDARD-000001"],
    toLocationCode: "LOCAL-TECH",
    reason: "Seed Lot 5 - changement d'emplacement valide",
    userId: direction.id
  });

  await seedMovement({
    movementNumber: "MVT-GRP-2026-000001",
    movementType: "LOAN_EVENT",
    movementStatus: "DRAFT",
    assetCodes: ["LIT-QUEEN-000001", "LIT-QUEEN-000002"],
    toLocationCode: "LOCAL-TECH",
    reason: "Seed Lot 5 - mouvement groupe en brouillon",
    userId: direction.id
  });

  await prisma.auditLog.create({
    data: {
      action: "SEED_LOT_5",
      entityTable: "asset_movements",
      entityId: "MVT-2026-000001",
      summary: "Creation des mouvements de test du Lot 5",
      metadata: JSON.stringify({ lot: 5 }),
      userId: direction.id
    }
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
