const QUANTITATIVE_TABLES = Object.freeze([
  {
    name: "quantitative_stock_positions",
    columns: ["id", "asset_entry_id", "location_id", "available_quantity", "created_at", "updated_at", "created_by", "updated_by"],
    constraint: "quantitative_stock_positions_available_quantity_check"
  },
  {
    name: "quantitative_movement_lines",
    columns: ["id", "movement_id", "asset_entry_id", "from_location_id", "to_location_id", "quantity", "line_notes", "created_at"],
    constraint: "quantitative_movement_lines_quantity_check"
  }
]);

export { QUANTITATIVE_TABLES };

export async function assertQuantitativeFoundationSchema(client, schema) {
  if (!client || typeof client.$queryRawUnsafe !== "function") {
    throw new TypeError("Le garde-fou quantitatif exige un client Prisma compatible avec $queryRawUnsafe.");
  }

  const tables = await client.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_name IN ('quantitative_stock_positions', 'quantitative_movement_lines')`,
    schema
  );
  if (tables.length !== QUANTITATIVE_TABLES.length) {
    throw new Error("SECURITE PRISMA: socle quantitatif incomplet (tables attendues absentes).");
  }

  const columns = await client.$queryRawUnsafe(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name IN ('quantitative_stock_positions', 'quantitative_movement_lines')`,
    schema
  );
  for (const table of QUANTITATIVE_TABLES) {
    const actual = new Set(columns.filter((column) => column.table_name === table.name).map((column) => column.column_name));
    if (table.columns.some((column) => !actual.has(column))) {
      throw new Error(`SECURITE PRISMA: colonnes quantitatives incomplètes pour ${table.name}.`);
    }
  }

  const constraints = await client.$queryRawUnsafe(
    `SELECT conname FROM pg_constraint WHERE connamespace = $1::regnamespace AND conname IN ('quantitative_stock_positions_available_quantity_check', 'quantitative_movement_lines_quantity_check')`,
    schema
  );
  const actualConstraints = new Set(constraints.map((constraint) => constraint.conname));
  if (QUANTITATIVE_TABLES.some((table) => !actualConstraints.has(table.constraint))) {
    throw new Error("SECURITE PRISMA: contraintes quantitatives essentielles absentes.");
  }
}
