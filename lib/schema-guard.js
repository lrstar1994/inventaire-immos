export async function assertExpectedSchema(client, expectedSchema, clientName) {
  if (!client || typeof client.$queryRaw !== "function") {
    throw new TypeError("Le garde-fou de schéma exige un client compatible avec $queryRaw.");
  }
  const rows = await client.$queryRaw`SELECT current_schema() AS schema`;
  const currentSchema = rows[0]?.schema ?? null;
  console.info(JSON.stringify({
    event: "prisma_write_target_check",
    provider: "postgresql",
    client: clientName,
    expectedSchema,
    currentSchema,
    guardClient: "transaction",
    globalClientUsedInsideTransaction: false
  }));
  if (currentSchema !== expectedSchema) {
    throw new Error(
      `SECURITE PRISMA: ${clientName} attend ${expectedSchema}, current_schema=${currentSchema || "inconnu"}.`
    );
  }
  return currentSchema;
}
