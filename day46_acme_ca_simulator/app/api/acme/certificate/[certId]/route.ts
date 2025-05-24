import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { getRootCA } from '@/lib/ca'; // To potentially chain with Root CA cert

export async function GET(request: Request, { params }: { params: { certId: string } }) {
  const certId = params.certId;

  try {
    const certStmt = db.prepare(
      'SELECT certificatePem, status FROM AcmeCertificates WHERE id = ?'
    );
    const certRecord = certStmt.get(certId) as { certificatePem: string; status: string } | undefined;

    if (!certRecord || certRecord.status !== 'valid') {
      // Also check traditional certs if certId could be a serial number from there
      // For simplicity, assuming certId is always from AcmeCertificates UUID for now.
      return new NextResponse('Certificate not found or not valid', { status: 404 });
    }

    // Optionally, chain with the Root CA certificate if this is an end-entity cert
    // For ACME, clients usually expect the full chain.
    // In this simulator, the root CA directly signs, so the chain is: End-Entity Cert -> Root CA Cert.
    const rootCA = await getRootCA();
    const fullChainPem = `${certRecord.certificatePem}\n${rootCA.certificatePem}`;

    const responseHeaders = new Headers({
      'Content-Type': 'application/pem-certificate-chain', // Standard type for full chain
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    });

    return new NextResponse(fullChainPem, { status: 200, headers: responseHeaders });

  } catch (dbError: any) {
    console.error('Database error fetching certificate:', dbError);
    return new NextResponse('Server error retrieving certificate', { status: 500 });
  }
}
