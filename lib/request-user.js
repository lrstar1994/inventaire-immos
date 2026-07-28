import { prisma } from "@/lib/prisma";

export async function getRequestUser(request) {
  const userId = request.headers.get("x-user-id");

  if (!userId) {
    return prisma.user.findFirst({
      where: { role: "DIRECTION", status: "ACTIVE", deletedAt: null },
      orderBy: { createdAt: "asc" }
    });
  }

  return prisma.user.findFirst({
    where: { id: userId, status: "ACTIVE", deletedAt: null }
  });
}
