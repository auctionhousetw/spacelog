import { PrismaClient } from '@prisma/client';

const prismaClientSingleton = () => new PrismaClient({ log: ['error'] });
declare global { var prismaLibGlobal: undefined | ReturnType<typeof prismaClientSingleton>; }
const prisma = globalThis.prismaLibGlobal ?? prismaClientSingleton();
if (process.env.NODE_ENV !== 'production') globalThis.prismaLibGlobal = prisma;

export default prisma;
