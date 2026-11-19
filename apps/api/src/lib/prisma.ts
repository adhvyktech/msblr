import { PrismaClient, Prisma } from '@prisma/client';

// Money: serialise Decimal as number.
(Prisma.Decimal.prototype as unknown as { toJSON: () => number }).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

const g = globalThis as unknown as { __prisma?: PrismaClient };
export const prisma: PrismaClient = g.__prisma ?? new PrismaClient();
g.__prisma = prisma;

export type Tx = Prisma.TransactionClient;
export { Prisma };
