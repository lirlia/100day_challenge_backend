'use client';

import { useState, useEffect, useCallback } from 'react';

interface Certificate {
  id: number | string; // TraditionalCertificates.id または AcmeCertificates.id (文字列の場合もあるので注意)
  commonName: string;
  serialNumber: string;
  issuedAt: string;
  expiresAt: string;
  status: 'valid' | 'revoked';
  issuer: string; // 発行者DN
  certificatePem: string; // 詳細表示用
  source: 'traditional' | 'acme'; // sourceを追加して、失効APIの呼び分けなどに使える（今回は共通API）
  // 他の必要なフィールドがあれば追加
}

interface CertificateListProps {
  refreshTrigger: number; // 親から渡される更新トリガー
  onCertificateSelect: (certificate: Certificate | null) => void; // 詳細表示用に選択された証明書を通知
  onCertificateRevoked: () => void; // 失効成功時に親に通知
}

export default function CertificateList({ refreshTrigger, onCertificateSelect, onCertificateRevoked }: CertificateListProps) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingSerial, setRevokingSerial] = useState<string | null>(null);

  const fetchCertificates = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ca/certificates'); // このAPIは後で作成
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '証明書一覧の取得に失敗しました。');
      }
      const data = await response.json();
      setCertificates(data || []);
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching certificates:', err);
      setCertificates([]); // エラー時は空にする
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates, refreshTrigger]);

  const handleRevoke = async (serialNumber: string) => {
    if (!window.confirm(`シリアル番号 ${serialNumber} の証明書を本当に失効しますか？この操作は元に戻せません。`)) {
      return;
    }
    setRevokingSerial(serialNumber);
    setError(null);
    try {
      const response = await fetch(`/api/ca/certificates/${serialNumber}/revoke`, {
        method: 'PUT',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '証明書の失効に失敗しました。');
      }
      alert(`証明書 ${serialNumber} を失効しました。`);
      onCertificateRevoked(); // 親に通知してリストを再更新
    } catch (err: any) {
      setError(err.message);
      console.error('Error revoking certificate:', err);
      alert(`エラー: ${err.message}`);
    } finally {
      setRevokingSerial(null);
    }
  };

  if (isLoading) {
    return <p className="text-center text-gray-400 py-8">証明書一覧を読み込み中...</p>;
  }

  if (error) {
    return <p className="bg-red-900 border border-red-700 text-red-300 px-4 py-3 rounded-md text-sm">エラー: {error}</p>;
  }

  if (certificates.length === 0) {
    return <p className="text-center text-gray-400 py-8">発行済みの証明書はありません。</p>;
  }

  return (
    <div className="bg-gray-800 shadow-xl rounded-lg p-6 mt-8">
      <h3 className="text-xl font-semibold text-teal-400 mb-6">発行済み証明書一覧</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-700">
          <thead className="bg-gray-750">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">コモンネーム</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">シリアル番号</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">発行日</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">有効期限</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">ステータス</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">発行者</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody className="bg-gray-800 divide-y divide-gray-700">
            {certificates.map((cert) => (
              <tr key={cert.serialNumber} className="hover:bg-gray-700 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-100">{cert.commonName}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 font-mono">{cert.serialNumber}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(cert.issuedAt).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(cert.expiresAt).toLocaleString()}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${cert.status === 'valid' ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                    {cert.status === 'valid' ? '有効' : '失効'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{cert.issuer}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                  <button
                    onClick={() => onCertificateSelect(cert)}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    詳細
                  </button>
                  {cert.status === 'valid' && (
                    <button
                      onClick={() => handleRevoke(cert.serialNumber)}
                      disabled={revokingSerial === cert.serialNumber}
                      className="text-red-500 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {revokingSerial === cert.serialNumber ? '失効中...' : '失効'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
