'use client';

import { useState } from 'react';
import CertificateRequestForm from '@/components/ca/CertificateRequestForm';
import CertificateList from '@/components/ca/CertificateList';
import RevocationListDisplay from '@/components/ca/RevocationListDisplay';
// import CertificateDetailsModal from '@/components/ca/CertificateDetailsModal'; // 後で作成

// Certificate型をCertificateListからインポートするか、ここで再定義
interface Certificate {
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

export default function CAManagementPage() {
  const [refreshTrigger, setRefreshTrigger] = useState(0); // リスト更新用トリガー
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null);
  const [showCrl, setShowCrl] = useState(false);

  const handleCertificateIssued = (newCertificate: any) => {
    console.log('New certificate issued:', newCertificate);
    setRefreshTrigger(prev => prev + 1); // リストを再読み込み
  };

  const handleCertificateRevoked = () => {
    console.log('Certificate revoked');
    setRefreshTrigger(prev => prev + 1);
  };

  const handleCertificateSelect = (certificate: Certificate | null) => {
    setSelectedCertificate(certificate);
  };

  // const handleCloseModal = () => {
  //   setSelectedCertificate(null);
  // };

  return (
    <div className="space-y-8">
      <CertificateRequestForm onCertificateIssued={handleCertificateIssued} />

      <div className="my-8 p-6 bg-gray-800 shadow-xl rounded-lg">
        <button
          onClick={() => setShowCrl(prev => !prev)}
          className="mb-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-sm transition-colors"
        >
          {showCrl ? 'CRLを隠す' : 'CRLを表示'}
        </button>
        {showCrl && <RevocationListDisplay />}
      </div>

      <CertificateList
        refreshTrigger={refreshTrigger}
        onCertificateSelect={handleCertificateSelect}
        onCertificateRevoked={handleCertificateRevoked}
      />
      {/* {selectedCertificate && (
        <CertificateDetailsModal
          certificate={selectedCertificate}
          onClose={handleCloseModal}
        />
      )} */}
      {selectedCertificate && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xl font-semibold text-sky-400">証明書詳細</h4>
              <button
                onClick={() => setSelectedCertificate(null)}
                className="text-gray-400 hover:text-gray-200 transition-colors p-1 rounded-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <p><strong className="text-gray-400 w-32 inline-block">コモンネーム:</strong> {selectedCertificate.commonName}</p>
              <p><strong className="text-gray-400 w-32 inline-block">シリアル番号:</strong> <span className="font-mono">{selectedCertificate.serialNumber}</span></p>
              <p><strong className="text-gray-400 w-32 inline-block">発行者:</strong> {selectedCertificate.issuer}</p>
              <p><strong className="text-gray-400 w-32 inline-block">発行日時:</strong> {new Date(selectedCertificate.issuedAt).toLocaleString()}</p>
              <p><strong className="text-gray-400 w-32 inline-block">有効期限:</strong> {new Date(selectedCertificate.expiresAt).toLocaleString()}</p>
              <p><strong className="text-gray-400 w-32 inline-block">ステータス:</strong> {selectedCertificate.status === 'valid' ? '有効' : '失効'}</p>
              <p><strong className="text-gray-400 w-32 inline-block">発行元:</strong> {selectedCertificate.source === 'traditional' ? '手動発行' : 'ACME'}</p>
              <div>
                <strong className="text-gray-400 block mb-1">証明書 (PEM):</strong>
                <pre className="bg-gray-900 p-3 rounded-md text-gray-300 whitespace-pre-wrap break-all font-mono text-xs">
                  {selectedCertificate.certificatePem}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
