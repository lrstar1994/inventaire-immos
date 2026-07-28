import { prisma } from "@/lib/prisma";

export async function writeAuditLog({ action, entityTable, entityId, summary, metadata, userId }) {
  return prisma.auditLog.create({
    data: {
      action,
      entityTable,
      entityId,
      summary,
      metadata: metadata ? JSON.stringify(metadata) : null,
      userId
    }
  });
}
