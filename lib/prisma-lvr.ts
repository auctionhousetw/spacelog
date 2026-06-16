import { PrismaClient } from '@prisma/client';

const prismaLvrClientSingleton = () =>
  new PrismaClient({
    log: ['error'],
    datasources: { db: { url: process.env.DATABASE_URL_LVR } },
  });

type PrismaLvrClientSingleton = ReturnType<typeof prismaLvrClientSingleton>;

declare global {
  var prismaLvrGlobal: PrismaLvrClientSingleton | undefined;
}

const prismaLvr = globalThis.prismaLvrGlobal ?? prismaLvrClientSingleton();

if (process.env.NODE_ENV !== 'production') globalThis.prismaLvrGlobal = prismaLvr;

export default prismaLvr;
