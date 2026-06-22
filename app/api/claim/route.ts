import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

declare global { var prismaGlobalClaim: undefined | PrismaClient; }
const prisma = globalThis.prismaGlobalClaim ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalClaim = prisma;

export async function POST(req: NextRequest) {
  try {
    const { city, district, communityName, role, contact, note } = await req.json();

    if (!contact || !role) {
      return NextResponse.json({ success: false, message: '請填寫身份與聯絡方式' }, { status: 400 });
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS community_claims (
        id SERIAL PRIMARY KEY,
        city TEXT,
        district TEXT,
        community_name TEXT,
        role TEXT,
        contact TEXT,
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(
      `INSERT INTO community_claims (city, district, community_name, role, contact, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      city ?? '', district ?? '', communityName ?? '', role, contact, note ?? ''
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('claim error', e);
    return NextResponse.json({ success: false, message: '系統錯誤，請稍後再試' }, { status: 500 });
  }
}
