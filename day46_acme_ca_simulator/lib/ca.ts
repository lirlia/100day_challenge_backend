import crypto from 'node:crypto';
// import db from './db'; // DB操作用 (現時点では未使用なのでコメントアウト)
import { generateRootCA, type RootCA } from './ca-utils'; // Assuming ca-utils.ts for RootCA type and generation

// --- 定数 ---
const ROOT_CA_ISSUER_NAME = 'CN=Day46 Root CA,O=100 Day Challenge,C=JP';
const ROOT_CA_COMMON_NAME = 'Day46 Root CA';
const ROOT_CA_ORG_NAME = '100 Day Challenge';
const ROOT_CA_COUNTRY_CODE = 'JP';
const ROOT_CA_VALIDITY_YEARS = 10;
const ISSUED_CERT_VALIDITY_YEARS = 1;
const ROOT_CA_SERIAL_NUMBER = '00'; // ルートCA自身のシリアルは固定

// --- ルートCA情報 (初期化時に設定) ---
let ROOT_CA_PRIVATE_KEY_PEM: string;
let ROOT_CA_PUBLIC_KEY_PEM: string;
let ROOT_CA_CERTIFICATE_PEM: string;

let rootCAInstance: RootCA | null = null;

export async function getRootCA(): Promise<RootCA> {
  if (!rootCAInstance) {
    try {
      rootCAInstance = await generateRootCA();
      console.log('Root CA generated and loaded for ca.ts.');
    } catch (e) {
      console.error("Failed to generate Root CA in ca.ts:", e);
      // Fallback to a very minimal RootCA to prevent further crashes if utils fails
      const fallbackKeyPair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      rootCAInstance = {
        privateKey: fallbackKeyPair.privateKey,
        // @ts-ignore // certificate field expects X509Certificate, but we provide a dummy for fallback
        certificate: { subject: 'CN=Fallback Dummy CA', issuer: 'CN=Fallback Dummy CA' },
        certificatePem: 'DUMMY_CERT_PEM_FALLBACK'
      };
    }
  }
  return rootCAInstance;
}

// --- 型定義 ---
export interface CertificateSubject {
  commonName: string; // CN
  organizationName?: string; // O
  countryCode?: string; // C
  // 他にもあれば追加
}

export interface CertificateInfo {
  serialNumber: string;
  subject: CertificateSubject;
  issuer: string; // 発行者DN (Distinguished Name)
  validFrom: Date;
  validTo: Date;
  publicKeyPem: string; // 被発行者の公開鍵
  isCA: boolean;
  // 他、拡張領域など (今回は簡略化)
}

// --- ユーティリティ関数 ---

/**
 * 新しいシリアル番号を生成 (UUID v4)
 */
export function generateSerialNumber(): string {
  return crypto.randomUUID();
}

/**
 * 日付を指定年数進める
 * @param date 基準日
 * @param years 加算する年数
 * @returns 加算後の日付
 */
export function addYears(date: Date, years: number): Date {
  const newDate = new Date(date);
  newDate.setFullYear(newDate.getFullYear() + years);
  return newDate;
}

function signData(data: string, privateKeyPem: string): string {
  const signer = crypto.createSign('SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

/**
 * 簡易的な証明書オブジェクトからPEM形式もどきの文字列を生成
 * (実際のX.509構造とは異なる、あくまでシミュレーション用)
 * @param certInfo 証明書情報
 * @param signatureValue 署名値 (Base64エンコード済み)
 * @returns PEM形式もどきの文字列
 */
function simplePEMCertToString(certInfo: CertificateInfo, signatureValue: string): string {
  const subjectString = `CN=${certInfo.subject.commonName}` +
                      `${certInfo.subject.organizationName ? ',O=' + certInfo.subject.organizationName : ''}` +
                      `${certInfo.subject.countryCode ? ',C=' + certInfo.subject.countryCode : ''}`;

  const content = [
    `Serial Number: ${certInfo.serialNumber}`,
    `Issuer: ${certInfo.issuer}`,
    `Validity:`,
    `  Not Before: ${certInfo.validFrom.toUTCString()}`,
    `  Not After: ${certInfo.validTo.toUTCString()}`,
    `Subject: ${subjectString}`,
    `Subject Public Key Info:`,
    ...certInfo.publicKeyPem.split('\n').map(line => `  ${line}`),
    `Is CA: ${certInfo.isCA}`,
    `Signature Algorithm: SHA256withRSA`, // 固定
    `Signature Value:`,
    ...(signatureValue.match(/.{1,64}/g)?.map(line => `  ${line}`) ?? [])
  ].join('\n');

  const base64Content = Buffer.from(content).toString('base64');
  return `-----BEGIN CERTIFICATE-----\n${base64Content.match(/.{1,64}/g)?.join('\n') ?? ''}\n-----END CERTIFICATE-----`;
}

// --- CA初期化 & コア機能 ---
function initializeRootCA() {
  if (ROOT_CA_PRIVATE_KEY_PEM && ROOT_CA_PUBLIC_KEY_PEM && ROOT_CA_CERTIFICATE_PEM) {
    // 既に初期化済み
    return;
  }

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  ROOT_CA_PRIVATE_KEY_PEM = privateKey;
  ROOT_CA_PUBLIC_KEY_PEM = publicKey;

  const now = new Date();
  const rootCaSubject: CertificateSubject = {
    commonName: ROOT_CA_COMMON_NAME,
    organizationName: ROOT_CA_ORG_NAME,
    countryCode: ROOT_CA_COUNTRY_CODE,
  };

  const rootCertInfo: CertificateInfo = {
    serialNumber: ROOT_CA_SERIAL_NUMBER,
    subject: rootCaSubject,
    issuer: ROOT_CA_ISSUER_NAME, // 自己署名なので自分自身
    validFrom: now,
    validTo: addYears(now, ROOT_CA_VALIDITY_YEARS),
    publicKeyPem: ROOT_CA_PUBLIC_KEY_PEM,
    isCA: true,
  };

  const dataToSign = `${rootCertInfo.serialNumber}\n${rootCertInfo.issuer}\n${rootCertInfo.validFrom.toISOString()}\n${rootCertInfo.validTo.toISOString()}\nCN=${rootCertInfo.subject.commonName}\n${rootCertInfo.publicKeyPem}`;
  const signature = signData(dataToSign, ROOT_CA_PRIVATE_KEY_PEM);
  ROOT_CA_CERTIFICATE_PEM = simplePEMCertToString(rootCertInfo, signature);

  console.log('Root CA initialized with generated keys and self-signed certificate.');
}

/**
 * ルートCAの情報を取得
 */
export function getRootCAInfo() {
  if (!ROOT_CA_PRIVATE_KEY_PEM) {
    initializeRootCA(); // まだ初期化されていなければ実行
  }
  return {
    privateKeyPem: ROOT_CA_PRIVATE_KEY_PEM,
    publicKeyPem: ROOT_CA_PUBLIC_KEY_PEM,
    certificatePem: ROOT_CA_CERTIFICATE_PEM,
    issuerName: ROOT_CA_ISSUER_NAME,
    serialNumber: ROOT_CA_SERIAL_NUMBER,
  };
}

/**
 * CSR情報と発行者の情報から証明書を発行する (シミュレーション)
 * @param subject 被発行者の情報
 * @param subjectPublicKeyPem 被発行者の公開鍵 (PEM)
 * @returns 発行された証明書のPEM文字列とシリアル番号、有効期限
 */
export function issueCertificate(
  subject: CertificateSubject,
  subjectPublicKeyPem: string
): { certificatePem: string; serialNumber: string; expiresAt: Date } {
  if (!ROOT_CA_PRIVATE_KEY_PEM) {
    initializeRootCA(); // 安全のため
  }
  const { privateKeyPem: issuerPrivateKeyPem, issuerName } = getRootCAInfo();

  const serialNumber = generateSerialNumber();
  const now = new Date();
  const expiresAt = addYears(now, ISSUED_CERT_VALIDITY_YEARS);

  const certInfo: CertificateInfo = {
    serialNumber,
    subject,
    issuer: issuerName,
    validFrom: now,
    validTo: expiresAt,
    publicKeyPem: subjectPublicKeyPem,
    isCA: false,
  };

  const dataToSign = `${serialNumber}\n${issuerName}\n${now.toISOString()}\n${expiresAt.toISOString()}\nCN=${subject.commonName}\n${subjectPublicKeyPem}`;
  const signature = signData(dataToSign, issuerPrivateKeyPem);
  const certificatePem = simplePEMCertToString(certInfo, signature);

  return { certificatePem, serialNumber, expiresAt };
}

// モジュールロード時にルートCAを初期化
initializeRootCA();

// 手動発行用 (シンプルなCNベース、CSRなし)
export async function issueSimpleCertificate(
  commonName: string,
  daysValid: number
): Promise<{ certificatePem: string; privateKeyPem: string; serialNumber: string; validFrom: Date; validTo: Date }> {
  const ca = await getRootCA();
  const serialNumber = crypto.randomBytes(16).toString('hex');
  const { privateKey: subjectPrivateKey, publicKey: subjectPublicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const subjectPrivateKeyPem = subjectPrivateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

  const validFrom = new Date();
  const validTo = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);

  // DUMMY PEM-like structure for simulation.
  const certificatePem =
`-----BEGIN CERTIFICATE-----
SIMULATED-CERT-FOR-${commonName}
Issuer: CN=${(ca.certificate as any)?.subject || 'Dummy CA'}
Subject: CN=${commonName}
Serial: ${serialNumber}
Valid From: ${validFrom.toUTCString()}
Valid To: ${validTo.toUTCString()}
-----END CERTIFICATE-----`;

  console.warn(`Using DUMMY certificate generation for issueSimpleCertificate for ${commonName}`);

  return {
    certificatePem,
    privateKeyPem: subjectPrivateKeyPem,
    serialNumber,
    validFrom,
    validTo,
  };
}

// ACME用: ルートCAによってCSRから証明書を発行 (超簡易シミュレーション)
export async function issueCertificateFromCsrByRootCA(
  csrPem: string, // Assume PEM format
  daysValid: number
): Promise<{ certificatePem: string; serialNumber: string; validFrom: Date; validTo: Date }> {
  const ca = await getRootCA();
  const serialNumber = crypto.randomBytes(16).toString('hex');
  let commonNameFromCsr = 'unknown.domain.com';
  try {
    // csrPem is a string, no need to Buffer.from if it's already PEM string
    const domains = await parseCsrForDomains(csrPem);
    if (domains.length > 0) commonNameFromCsr = domains[0];
  } catch (e) {
    console.warn('Failed to parse CN from CSR for cert issuance, using default.', e);
  }

  const validFrom = new Date();
  const validTo = new Date(Date.now() + daysValid * 24 * 60 * 60 * 1000);

  const certificatePem =
`-----BEGIN CERTIFICATE-----
SIMULATED-ACME-CERT-FOR-${commonNameFromCsr}
Issuer: CN=${(ca.certificate as any)?.subject || 'Dummy CA'}
Subject: CN=${commonNameFromCsr}
Serial: ${serialNumber}
Valid From: ${validFrom.toUTCString()}
Valid To: ${validTo.toUTCString()}
-----END CERTIFICATE-----`;

  console.warn(`Using DUMMY certificate generation from CSR for ${commonNameFromCsr}.`);

  return {
    certificatePem,
    serialNumber,
    validFrom,
    validTo,
  };
}

// CSRからドメインをパース (超簡易版)
export async function parseCsrForDomains(csrPemString: string): Promise<string[]> {
  try {
    // Match CN= in Subject line or anywhere for simplicity
    const cnMatch = csrPemString.match(/CN=([^\\/\\n,]+)/);
    if (cnMatch && cnMatch[1]) {
      return [cnMatch[1].trim()];
    }
  } catch (e) {
    console.error('Error in simplified CSR parsing:', e);
    // Fall through to return default on error
  }
  console.warn('Returning default domain from parseCsrForDomains due to parsing difficulty or no CN found.');
  return ['parsed.default.com']; // Fallback for simulation
}

// CRL生成関数 (ダミー)
export async function generateCRL(): Promise<string> {
  const ca = await getRootCA();
  console.warn('Using DUMMY CRL generation');
  return `-----BEGIN X509 CRL-----\nVersion 1 (0x0)\nSignature Algorithm: sha256WithRSAEncryption\nIssuer: CN=${(ca.certificate as any)?.subject || 'Dummy CA'}\nLast Update: ${new Date().toUTCString()}\nNext Update: ${new Date(Date.now() + 24*60*60*1000).toUTCString()}\nNo Revoked Certificates.\n-----END X509 CRL-----`;
}
