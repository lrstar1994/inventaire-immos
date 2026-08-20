import { authorizeApiRequest } from "@/lib/authorization-http";
import { jsonOk } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const include = {
  location: { select: { id: true, name: true, code: true } },
  assetEntry: {
    select: {
      id: true, entryNumber: true, quantity: true, entryDate: true, unitPrice: true, totalPrice: true,
      priceKnown: true, invoiceAvailable: true, invoiceReference: true, notes: true,
      supplier: { select: { id: true, name: true, code: true } },
      assetItem: {
        select: {
          id: true, name: true, code: true, unitLabel: true,
          category: {
            select: {
              id: true, name: true, code: true, hierarchyLevel: true, trackingMode: true, controlLevel: true,
              parent: { select: { id: true, name: true, code: true, parent: { select: { id: true, name: true, code: true } } } }
            }
          }
        }
      }
    }
  }
};

export async function GET() {
  const authorization = await authorizeApiRequest();
  if (authorization.response) return authorization.response;
  const positions = await prisma.quantitativeStockPosition.findMany({ include, orderBy: { createdAt: "desc" } });
  return jsonOk({ positions });
}
