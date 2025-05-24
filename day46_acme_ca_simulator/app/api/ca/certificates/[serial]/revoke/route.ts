import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface RouteParams {
  params: { serial: string };
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const serialNumber = params.serial;

    if (!serialNumber) {
      return NextResponse.json({ error: 'Serial number is required' }, { status: 400 });
    }

    let changes = 0;

    // TraditionalCertificates テーブルを更新
    const stmtTraditional = db.prepare(
      'UPDATE TraditionalCertificates SET status = ? WHERE serialNumber = ?'
    );
    const resultTraditional = stmtTraditional.run('revoked', serialNumber);
    changes += resultTraditional.changes;

    // AcmeCertificates テーブルを更新
    const stmtAcme = db.prepare(
      'UPDATE AcmeCertificates SET status = ? WHERE serialNumber = ?'
    );
    const resultAcme = stmtAcme.run('revoked', serialNumber);
    changes += resultAcme.changes;

    if (changes === 0) {
      return NextResponse.json({ error: 'Certificate not found or already revoked' }, { status: 404 });
    }

    return NextResponse.json({ message: `Certificate ${serialNumber} revoked successfully` });

  } catch (error) {
    console.error('Error revoking certificate:', error);
    return NextResponse.json({ error: 'Failed to revoke certificate' }, { status: 500 });
  }
}
