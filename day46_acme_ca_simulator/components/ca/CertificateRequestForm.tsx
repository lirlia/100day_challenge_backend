'use client';

import { useState, type FormEvent } from 'react';

interface CertificateRequestFormProps {
  onCertificateIssued: (newCertificate: any) => void; // 発行成功時に親に通知
}

export default function CertificateRequestForm({ onCertificateIssued }: CertificateRequestFormProps) {
  const [commonName, setCommonName] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [countryCode, setCountryCode] = useState('JP');
  const [publicKeyPem, setPublicKeyPem] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    if (!commonName.trim() || !publicKeyPem.trim()) {
      setError('コモンネームと公開鍵は必須です。');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/ca/issue-certificate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commonName, organizationName, countryCode, publicKeyPem }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '証明書の発行に失敗しました。');
      }

      setSuccessMessage(`証明書が発行されました！ シリアル番号: ${data.serialNumber}`);
      onCertificateIssued(data); // 親コンポーネントに通知
      // フォームをリセット
      setCommonName('');
      setOrganizationName('');
      setCountryCode('JP');
      setPublicKeyPem('');

    } catch (err: any) {
      setError(err.message || '予期せぬエラーが発生しました。');
      console.error('Certificate issuance error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 p-6 bg-gray-800 shadow-xl rounded-lg">
      <h3 className="text-xl font-semibold text-cyan-400 mb-4">証明書発行要求 (手動)</h3>

      {error && <p className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">エラー: {error}</p>}
      {successMessage && <p className="bg-green-900 border border-green-700 text-green-300 px-4 py-3 rounded-md text-sm">{successMessage}</p>}

      <div>
        <label htmlFor="commonName" className="block text-sm font-medium text-gray-300 mb-1">コモンネーム (CN) <span className="text-red-400">*</span></label>
        <input
          type="text"
          id="commonName"
          value={commonName}
          onChange={(e) => setCommonName(e.target.value)}
          required
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-100"
          placeholder="例: example.com, My Server"
        />
      </div>

      <div>
        <label htmlFor="organizationName" className="block text-sm font-medium text-gray-300 mb-1">組織名 (O)</label>
        <input
          type="text"
          id="organizationName"
          value={organizationName}
          onChange={(e) => setOrganizationName(e.target.value)}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-100"
          placeholder="例: Example Inc."
        />
      </div>

      <div>
        <label htmlFor="countryCode" className="block text-sm font-medium text-gray-300 mb-1">国コード (C)</label>
        <input
          type="text"
          id="countryCode"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          maxLength={2}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-100"
          placeholder="例: JP"
        />
      </div>

      <div>
        <label htmlFor="publicKeyPem" className="block text-sm font-medium text-gray-300 mb-1">公開鍵 (PEM形式) <span className="text-red-400">*</span></label>
        <textarea
          id="publicKeyPem"
          value={publicKeyPem}
          onChange={(e) => setPublicKeyPem(e.target.value)}
          required
          rows={6}
          className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-100 font-mono text-sm"
          placeholder="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 focus:ring-cyan-500 disabled:opacity-50 transition-colors"
      >
        {isLoading ? '発行処理中...' : '証明書発行'}
      </button>
    </form>
  );
}
