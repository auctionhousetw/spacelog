import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

declare global { var prismaGlobalAdminClaimsId: undefined | PrismaClient; }
const prisma = globalThis.prismaGlobalAdminClaimsId ?? new PrismaClient({ log: ['error'] });
if (process.env.NODE_ENV !== 'production') globalThis.prismaGlobalAdminClaimsId = prisma;

type Params = Promise<{ id: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    const { id } = await params;
    const { status } = await req.json();

    await prisma.$executeRawUnsafe(
      `UPDATE community_claims SET status=$1 WHERE id=$2`,
      status, parseInt(id)
    );

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('admin claims PATCH error', e);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
