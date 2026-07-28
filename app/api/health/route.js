import { prisma } from "@/lib/prisma";
import { jsonOk } from "@/lib/api";

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;

  return jsonOk({
    status: "ok",
    module: "app-inventaire-immos",
    lot: "1",
    database: "reachable"
  });
}
