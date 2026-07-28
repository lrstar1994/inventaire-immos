import { PrismaClient } from "@/generated/prisma-lot6";

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma?.assetDocument
    ? globalForPrisma.prisma
    :
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
