import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const result: Record<string, any> = {
    DATABASE_URL_prefix: process.env.DATABASE_URL?.slice(0, 40) ?? 'MISSING',
    DATABASE_URL_LVR_prefix: process.env.DATABASE_URL_LVR?.slice(0, 40) ?? 'MISSING',
  };

  try {
    const rows = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      'SELECT COUNT(*) as count FROM houses'
    );
    result.houses_count = Number(rows[0].count);
  } catch (e: any) {
    result.houses_error = e?.message ?? String(e);
  }

  return NextResponse.json(result);
}
