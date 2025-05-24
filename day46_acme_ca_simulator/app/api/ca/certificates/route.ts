import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getRootCAInfo } from '@/lib/ca'; // ルートCA情報取得のため (発行者名など)

interface RawTraditionalCertificate {
  id: number;
  commonName: string;
  serialNumber: string;
  issuedAt: string; // ISO String
  expiresAt: string; // ISO String
  status: 'valid' | 'revoked';
  issuedBy: string;
  certificatePem: string;
  // organizationName, countryCode, publicKeyPem はUI一覧では直接使わないが、詳細表示用に含めても良い
}

interface RawAcmeCertificate {
  id: string; // UUID
  orderId: string;
  csrPem: string; // これから commonName をパースするのは大変なので、AcmeOrders.domain を使う
  certificatePem: string;
  serialNumber: string;
  issuedAt: string; // ISO String
  expiresAt: string; // ISO String
  status: 'valid' | 'revoked';
}

// クライアントに返す共通の証明書情報フォーマット
interface UnifiedCertificate {
  id: number | string;
  commonName: string;
  serialNumber: string;
  issuedAt: string;
  expiresAt: string;
  status: 'valid' | 'revoked';
  issuer: string;
  certificatePem: string;
  source: 'traditional' | 'acme';
}

export async function GET() {
  try {
    const rootCA = getRootCAInfo(); // ACME発行証明書の発行者名に使用

    // 手動発行された証明書を取得
    const traditionalCertsStmt = db.prepare('SELECT id, commonName, serialNumber, issuedAt, expiresAt, status, issuedBy, certificatePem FROM TraditionalCertificates ORDER BY issuedAt DESC');
    const traditionalCertsRaw = traditionalCertsStmt.all() as RawTraditionalCertificate[];
    const traditionalCerts: UnifiedCertificate[] = traditionalCertsRaw.map(cert => ({
      id: cert.id,
      commonName: cert.commonName,
      serialNumber: cert.serialNumber,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      status: cert.status,
      issuer: cert.issuedBy,
      certificatePem: cert.certificatePem,
      source: 'traditional' as 'traditional',
    }));

    // ACME経由で発行された証明書を取得
    // AcmeCertificatesにはcommonNameがないため、AcmeOrdersテーブルからドメイン名を取得する必要がある
    const acmeCertsStmt = db.prepare(`
      SELECT
        ac.id, ac.orderId, ac.certificatePem, ac.serialNumber, ac.issuedAt, ac.expiresAt, ac.status, json_extract(ao.identifiers, '$[0].value') as commonName
      FROM AcmeCertificates ac
      JOIN AcmeOrders ao ON ac.orderId = ao.id
      ORDER BY ac.issuedAt DESC
    `);
    const acmeCertsRaw = acmeCertsStmt.all() as (RawAcmeCertificate & { commonName: string })[];
    const acmeCerts: UnifiedCertificate[] = acmeCertsRaw.map(cert => ({
      id: cert.id,
      commonName: cert.commonName, // AcmeOrders.domain を使用
      serialNumber: cert.serialNumber,
      issuedAt: cert.issuedAt,
      expiresAt: cert.expiresAt,
      status: cert.status,
      issuer: rootCA.issuerName, // ACME発行の証明書はルートCAが発行
      certificatePem: cert.certificatePem,
      source: 'acme' as 'acme',
    }));

    // 両者を結合して日付でソート (新しいものが先)
    const allCerts = [...traditionalCerts, ...acmeCerts].sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());

    return NextResponse.json(allCerts);

  } catch (error) {
    console.error('Error fetching certificates:', error);
    return NextResponse.json({ error: 'Failed to fetch certificates' }, { status: 500 });
  }
}
