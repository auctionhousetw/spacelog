import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

declare global { var prismaGlobalAdminClaims: undefined | PrismaClient; }
const prisma = globalThis.prismaGlobalAdminClaims ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalAdminClaims = prisma;

export async function GET() {
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE community_claims ADD COLUMN IF NOT EXISTS status TEXT DEFAULT '待處理'`
    );

    const claims = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, city, district, community_name, role, contact, note, status, created_at
       FROM community_claims ORDER BY created_at DESC`
    );

    return NextResponse.json(claims);
  } catch (e) {
    console.error('admin claims GET error', e);
    return NextResponse.json({ error: '讀取失敗' }, { status: 500 });
  }
}
