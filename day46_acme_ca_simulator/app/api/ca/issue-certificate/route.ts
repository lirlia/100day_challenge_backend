import { NextResponse } from 'next/server';
import db from '@/lib/db'; // DBインスタンス
import {
  issueCertificate as issueCertificateCore,
  getRootCAInfo,
  type CertificateSubject,
} from '@/lib/ca'; // CAコアロジック

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { commonName, organizationName, countryCode, publicKeyPem } = body;

    if (!commonName || !publicKeyPem) {
      return NextResponse.json({ error: 'Common name and public key are required' }, { status: 400 });
    }

    const subject: CertificateSubject = {
      commonName,
      organizationName,
      countryCode,
    };

    // lib/ca.tsの関数を使って証明書を発行
    // issueCertificateCore は issuerPrivateKeyPem と issuerName を内部で getRootCAInfo から取得する想定
    const { certificatePem, serialNumber, expiresAt } = issueCertificateCore(
      subject,
      publicKeyPem
    );

    const rootCA = getRootCAInfo();
    const issuedAt = new Date();

    // DBに保存
    const stmt = db.prepare(`
      INSERT INTO TraditionalCertificates
      (commonName, organizationName, countryCode, publicKeyPem, certificatePem, serialNumber, issuedAt, expiresAt, issuedBy, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      commonName,
      organizationName || null,
      countryCode || null,
      publicKeyPem,
      certificatePem,
      serialNumber,
      issuedAt.toISOString(),
      expiresAt.toISOString(),
      rootCA.issuerName,
      'valid'
    );

    if (result.changes === 0) {
      console.error('Failed to save certificate to DB', { commonName, serialNumber });
      return NextResponse.json({ error: 'Failed to issue certificate (DB error)' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Certificate issued successfully',
      certificatePem,
      serialNumber,
      commonName,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      issuer: rootCA.issuerName,
    }, { status: 201 });

  } catch (error) {
    console.error('Error issuing certificate:', error);
    if (error instanceof SyntaxError) { // JSONパースエラーなど
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to issue certificate' }, { status: 500 });
  }
}
