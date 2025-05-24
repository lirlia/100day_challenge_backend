import { NextResponse } from 'next/server';
import db from '@/lib/db';

interface RevokedCertificateInfo {
  serialNumber: string;
  commonName?: string; // 取得できれば
  // revokedAt: string; // 失効日時を記録するカラムがあれば追加
}

export async function GET() {
  try {
    const revokedCerts: RevokedCertificateInfo[] = [];

    // TraditionalCertificates から失効済みを取得
    const stmtTraditional = db.prepare(
      "SELECT serialNumber, commonName FROM TraditionalCertificates WHERE status = 'revoked'"
    );
    const traditionalRevoked = stmtTraditional.all() as { serialNumber: string; commonName: string }[];
    traditionalRevoked.forEach(cert => revokedCerts.push(cert));

    // AcmeCertificates から失効済みを取得 (commonNameはAcmeOrdersからJOIN)
    const stmtAcme = db.prepare(`
      SELECT ac.serialNumber, ao.domain as commonName
      FROM AcmeCertificates ac
      JOIN AcmeOrders ao ON ac.orderId = ao.id
      WHERE ac.status = 'revoked'
    `);
    const acmeRevoked = stmtAcme.all() as { serialNumber: string; commonName: string }[];
    acmeRevoked.forEach(cert => revokedCerts.push(cert));

    // 本来のCRLはもっと複雑な形式だが、ここでは簡易的なJSONリストを返す
    return NextResponse.json({
      crlVersion: 1, // ダミー
      lastUpdate: new Date().toISOString(), // ダミー
      revokedCertificates: revokedCerts,
    });

  } catch (error) {
    console.error('Error fetching CRL:', error);
    return NextResponse.json({ error: 'Failed to fetch CRL' }, { status: 500 });
  }
}
