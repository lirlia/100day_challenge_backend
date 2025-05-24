"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { postAsJws, getKeyAuthorization, getNonce, createJws } from '@/lib/acme-client-utils';

// JWK (JSON Web Key) interface - JsonWebKey を拡張する形に変更
export interface Jwk extends JsonWebKey {
  crv?: string; // EC curve name - JsonWebKey にも含まれるが、型推論のために明示
  x?: string;   // EC x coordinate - 同上
  y?: string;   // EC y coordinate - 同上
  d?: string;   // EC private key component - 同上
  // 必要に応じて他のプロパティも明示
  [key: string]: unknown; // 既存のままでも良いが、JsonWebKeyでカバーされるものが多い
}

// 追加: ACME Challenge type
interface AcmeChallenge {
  id: string; // Add challenge ID
  type: string;
  url: string;
  status: string;
  token: string;
  keyAuthorization?: string; // 生成して追加
}

// 追加: ACME Authorization type
interface AcmeAuthorization {
  identifier: { type: string; value: string };
  status: string;
  expires: string;
  challenges: AcmeChallenge[];
  url: string; // Authorization URL itself
}

type AcmeClientStep =
  | 'initial'
  | 'keysGenerated'
  | 'accountRegistered'
  | 'orderCreated'
  | 'challengeSubmitted'
  | 'finalizationProcessing'
  | 'orderFinalizationFailed'
  | 'certificateReady'
  | 'certificateDownloaded';

const AcmeClientFlow = () => {
  const [currentStep, setCurrentStep] = useState<AcmeClientStep>('initial');
  const [accountKeys, setAccountKeys] = useState<{ publicKey: Jwk; privateKey: Jwk } | null>(null);
  const [contactEmail, setContactEmail] = useState<string>('test@example.com');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // New state variables for order and challenge
  const [domain, setDomain] = useState<string>('');
  const [orderUrl, setOrderUrl] = useState<string | null>(null);
  const [orderData, setOrderData] = useState<any | null>(null); // Full order object
  const [authorizations, setAuthorizations] = useState<AcmeAuthorization[]>([]); // Changed to store full auth objects
  const [http01Challenge, setHttp01Challenge] = useState<AcmeChallenge | null>(null);
  const [finalizeUrl, setFinalizeUrl] = useState<string | null>(null);
  const [certificateUrl, setCertificateUrl] = useState<string | null>(null); // Added for cert download
  const [certificatePem, setCertificatePem] = useState<string | null>(null); // Added for cert display
  // const [challengeVerificationPayload, setChallengeVerificationPayload] = useState<string>(''); // Not strictly needed if keyAuth is in http01Challenge

  useEffect(() => {
    console.log('[AcmeClientFlow] orderData state changed:', JSON.stringify(orderData, null, 2));
  }, [orderData]);

  const generateKeys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true, // extractable
        ['sign', 'verify']
      );

      const publicKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.publicKey!);
      const privateKeyJwk = await window.crypto.subtle.exportKey('jwk', keyPair.privateKey!);

      setAccountKeys({ publicKey: publicKeyJwk as Jwk, privateKey: privateKeyJwk as Jwk });
      setCurrentStep('keysGenerated');
    } catch (e: any) {
      console.error('Key generation failed:', e);
      setError(`キー生成に失敗しました: ${e.message}`);
      setAccountKeys(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRegisterAccount = useCallback(async () => {
    if (!accountKeys || !contactEmail) {
      setError('キーペアとメールアドレスが必要です。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const directoryUrl = '/api/acme/directory';
      const newAccountUrl = (await (await fetch(directoryUrl)).json()).newAccount;
      if (!newAccountUrl) throw new Error('newAccount URL not found in directory');

      const payload = {
        contact: [`mailto:${contactEmail}`],
        termsOfServiceAgreed: true,
      };

      const { response, body } = await postAsJws(
        newAccountUrl,
        payload,
        accountKeys.privateKey,
        accountKeys.publicKey,
        directoryUrl
      );

      const locationHeader = response.headers.get('Location');
      if (!locationHeader) {
        throw new Error('アカウントID(Locationヘッダー)が見つかりません。');
      }
      setAccountId(locationHeader);
      setCurrentStep('accountRegistered');
      console.log('Account registered:', body, 'ID:', locationHeader);

    } catch (e: any) {
      console.error('Account registration failed:', e);
      setError(`アカウント登録に失敗しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [accountKeys, contactEmail]);

  // New function to create an order
  const handleCreateOrder = useCallback(async () => {
    if (!accountId || !domain || !accountKeys) {
      setError('アカウントID、ドメイン、アカウントキーが必要です。');
      return;
    }
    setLoading(true);
    setError(null);
    setOrderData(null);
    setAuthorizations([]);
    setHttp01Challenge(null);
    setFinalizeUrl(null);

    try {
      const directoryUrl = '/api/acme/directory';
      const dir = await (await fetch(directoryUrl)).json();
      const newOrderUrl = dir.newOrder;
      if (!newOrderUrl) throw new Error('newOrder URL not found in directory');

      const payload = {
        identifiers: [{ type: 'dns', value: domain }],
      };

      const { response, body: order } = await postAsJws(
        newOrderUrl,
        payload,
        accountKeys.privateKey,
        accountKeys.publicKey,
        directoryUrl,
        accountId
      );

      if (!response.ok) {
        console.error("Order creation failed response:", response, order);
        throw new Error(`オーダー作成に失敗しました: ${order?.detail || response.statusText}`);
      }

      const locationHeader = response.headers.get('Location');
      if (!locationHeader) {
        throw new Error('オーダーURL (Locationヘッダー)が見つかりません。');
      }
      setOrderUrl(locationHeader);
      setOrderData(order);
      setFinalizeUrl(order.finalize);

      // Fetch authorization details
      if (order.authorizations && order.authorizations.length > 0) {
        const authzDetailsPromises = order.authorizations.map(async (authzUrl: string) => {
          const authzResponse = await postAsJws( // GET request signed with JWS
            authzUrl,
            {}, // payload を null から {} に変更
            accountKeys.privateKey,
            accountKeys.publicKey, // publicKeyJwk (Jwk)
            directoryUrl,
            accountId              // accountId (string)
          );
          if (!authzResponse.response.ok) {
            throw new Error(`認証情報の取得に失敗: ${authzResponse.body?.detail || authzResponse.response.statusText}`);
          }
          // Add the authz URL to the object for later use (e.g. challenge completion notification)
          return { ...authzResponse.body, url: authzUrl } as AcmeAuthorization;
        });
        const fetchedAuths = await Promise.all(authzDetailsPromises);
        setAuthorizations(fetchedAuths);
      } else {
        setError("オーダーに認証情報が含まれていません。");
      }

      setCurrentStep('orderCreated');
      console.log('Order created:', order, 'Order URL:', locationHeader);

    } catch (e: any) {
      console.error('Order creation failed:', e);
      setError(`オーダー作成に失敗しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [accountId, domain, accountKeys]);

  // useEffect to derive http01Challenge when authorizations or accountKeys change
  useEffect(() => {
    if (authorizations.length > 0 && accountKeys?.publicKey) {
      const updateAuthorizationsWithKeyAuth = async () => {
        let firstHttp01Challenge: AcmeChallenge | null = null;
        const updatedAuthorizations = await Promise.all(
          authorizations.map(async (auth) => {
            const updatedChallenges = await Promise.all(
              auth.challenges.map(async (challenge) => {
                if (challenge.type === 'http-01') {
                  try {
                    const keyAuth = await getKeyAuthorization(challenge.token, accountKeys.publicKey as Jwk);
                    const challengeWithKeyAuth = { ...challenge, keyAuthorization: keyAuth };
                    if (!firstHttp01Challenge) {
                      firstHttp01Challenge = challengeWithKeyAuth; // Keep track of the first one for http01Challenge state
                    }
                    return challengeWithKeyAuth;
                  } catch (e: any) {
                    console.error(`Error generating keyAuthorization for ${challenge.token}:`, e);
                    setError((prev) => prev ? `${prev}\nKey Auth生成エラー (${challenge.token})` : `Key Auth生成エラー (${challenge.token})`);
                    return challenge; // Return original challenge on error
                  }
                }
                return challenge;
              })
            );
            return { ...auth, challenges: updatedChallenges };
          })
        );
        setAuthorizations(updatedAuthorizations);
        if (firstHttp01Challenge) {
          setHttp01Challenge(firstHttp01Challenge);
        } else if (currentStep === 'orderCreated') {
          setError((prev) => prev ? `${prev}\nオーダーからHTTP-01チャレンジが見つかりませんでした。` : "オーダーからHTTP-01チャレンジが見つかりませんでした。");
        }
      };
      updateAuthorizationsWithKeyAuth();
    } else if (currentStep === 'orderCreated' && authorizations.length === 0 && orderData) {
        if (orderData.status !== 'invalid') {
            setError("オーダーに有効な認証情報が含まれていません。");
        }
    }
  }, [accountKeys, currentStep]); // Removed authorizations from dependency array to avoid loop with its own update

  // Helper to poll order status (e.g., when finalization is processing)
  const pollOrderStatus = useCallback(async () => {
    if (!orderUrl || !accountId || !accountKeys?.privateKey || !accountKeys?.publicKey) return;
    setLoading(true);
    setError(null);
    try {
      const { response, body: updatedOrder } = await postAsJws(
        orderUrl,
        {},
        accountKeys.privateKey,
        accountKeys.publicKey,
        '/api/acme/directory',
        accountId
      );
      if (!response.ok) throw new Error(`オーダーステータスの取得に失敗: ${updatedOrder?.detail || response.statusText}`);

      setOrderData(updatedOrder);
      console.log("[AcmeClientFlow] Order data updated by poller:", JSON.stringify(updatedOrder, null, 2));

      if (updatedOrder.status === 'valid' && updatedOrder.certificate) {
        setCertificateUrl(updatedOrder.certificate);
        setCurrentStep('certificateReady');
      } else if (updatedOrder.status === 'invalid') {
        setError(`オーダーが無効になりました: ${updatedOrder.error?.detail || 'Unknown reason'}`);
        setCurrentStep('orderFinalizationFailed');
      } else if (updatedOrder.status === 'processing') {
        setCurrentStep('finalizationProcessing'); // Still processing
      } else {
         console.log("Order status poller: ", updatedOrder.status)
      }
    } catch(e: any) {
      setError(`オーダーステータス確認失敗: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [orderUrl, accountId, accountKeys]);

  // Function to notify CA that challenge is ready for validation
  const handleCompleteChallenge = useCallback(async () => {
    if (!http01Challenge?.url || !accountId || !accountKeys?.privateKey || !accountKeys?.publicKey) {
      setError('チャレンジURL、アカウントID、またはキーがありません。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {};

      const { response, body: updatedChallenge } = await postAsJws(
        http01Challenge.url,
        payload,
        accountKeys.privateKey,
        accountKeys.publicKey,
        '/api/acme/directory',
        accountId
      );

      if (!response.ok) {
        throw new Error(`チャレンジ応答の送信に失敗: ${updatedChallenge?.detail || response.statusText}`);
      }
      console.log('Challenge response sent, server will now attempt validation:', updatedChallenge);

      setHttp01Challenge(prev => prev ? { ...prev, status: updatedChallenge.status || 'processing' } : null);
      setCurrentStep('challengeSubmitted');

      // ★★★ チャレンジ送信成功後、オーダーステータスをポーリングする ★★★
      if (orderUrl) { // orderUrl が存在する場合のみ実行
        console.log("Challenge submitted, now polling order status...");
        await pollOrderStatus(); // pollOrderStatus を呼び出し、完了を待つ
      } else {
        console.warn("Order URL not available, cannot poll order status after challenge submission.");
      }

    } catch (e: any) {
      console.error('Challenge completion failed:', e);
      setError(`チャレンジ完了処理に失敗しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [http01Challenge, accountId, accountKeys, orderUrl, pollOrderStatus]); // pollOrderStatus と orderUrl を依存配列に追加

  // Function to finalize the order
  const handleFinalizeOrder = useCallback(async () => {
    if (!orderUrl || !finalizeUrl || !accountId || !accountKeys?.privateKey || !accountKeys?.publicKey || !domain) {
      setError('オーダー情報、最終化URL、アカウントID、キー、またはドメインが不足しています。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Create a dummy CSR. In a real client, this would be generated from a private key.
      // The CSR needs to be base64url encoded for the JWS payload.
      // This is a very basic, non-functional CSR for placeholder purposes.
      const dummyCsrPem =
        `-----BEGIN CERTIFICATE REQUEST-----\n` +
        `MIICvDCCAaQCAQAwdzELMAkGA1UEBhMCVVMxDTALBgNVBAgMBENhbGExFjAUBgNV\n` +
        `BAcMDVNhbiBGcmFuY2lzY28xEDAOBgNVBAoMB0V4YW1wbGUxGTAXBgNVBAMMEGV4\n` +
        `YW1wbGUuY29tMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA7gPK4cMO\n` +
        `... (rest of a dummy CSR) ...\n` +
        `-----END CERTIFICATE REQUEST-----`;

      // RFC 8555: CSR is base64url encoded DER.
      // For this simulator, we send a base64url encoded version of the PEM string directly.
      // This is not a valid CSR format for a real ACME server.
      const base64UrlCsr = btoa(dummyCsrPem).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

      const payload = {
        csr: base64UrlCsr,
      };

      const { response, body: finalizedOrder } = await postAsJws(
        finalizeUrl,
        payload,
        accountKeys.privateKey,
        accountKeys.publicKey, // For protected header, if accountId is not used (but it is here)
        '/api/acme/directory', // nonce URL
        accountId             // accountId for KID
      );

      if (!response.ok) {
        throw new Error(`オーダーの最終化に失敗: ${finalizedOrder?.detail || response.statusText}`);
      }

      setOrderData(finalizedOrder);
      console.log('Order finalized:', finalizedOrder);

      if (finalizedOrder.status === 'valid' && finalizedOrder.certificate) {
        setCertificateUrl(finalizedOrder.certificate);
        setCurrentStep('certificateReady');
      } else if (finalizedOrder.status === 'processing') {
        setCurrentStep('finalizationProcessing');
      } else {
        setError(`最終化後のオーダーステータスが不正です: ${finalizedOrder.status}. ${finalizedOrder.error?.detail || ''}`);
        setCurrentStep('orderFinalizationFailed');
      }

    } catch (e: any) {
      console.error('Order finalization failed:', e);
      setError(`オーダー最終化に失敗しました: ${e.message}`);
      setCurrentStep('orderFinalizationFailed'); // Ensure step reflects failure
    } finally {
      setLoading(false);
    }
  }, [orderUrl, finalizeUrl, accountId, accountKeys, domain]);

  // Function to download certificate
  const handleDownloadCertificate = useCallback(async () => {
    if (!certificateUrl || !accountId || !accountKeys?.privateKey || !accountKeys?.publicKey) {
      setError('証明書URL、アカウントID、またはキーがありません。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // For downloading certs, it's a GET-as-POST or a simple GET with Accept header.
      // Our postAsJws can simulate GET-as-POST if payload is an empty object.
      // The server should respond with the certificate in the body (PEM format).
      const nonce = await getNonce('/api/acme/directory'); // Assuming getNonce is available and exported
      const protectedHeader = {
        alg: 'ES256', // Or derive from key
        kid: accountId,
        nonce: nonce,
        url: certificateUrl,
      };
      const jwsPayload = await createJws(
        '', // Empty payload for cert download, as per RFC 8555 Appendix A.2.
        accountKeys.privateKey,
        protectedHeader
      );

      const response = await fetch(certificateUrl, {
        method: 'POST', // GET-as-POST
        headers: {
          'Content-Type': 'application/jose+json',
          // 'Accept': 'application/pem-certificate-chain' // Server might ignore this for POST
        },
        body: jwsPayload,
      });

      const newNonce = response.headers.get('Replay-Nonce');
      // TODO: Store newNonce from response headers if needed for subsequent requests (e.g. in a global state or returned by postAsJws)

      if (!response.ok) {
        let errorBody;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { detail: await response.text() || response.statusText };
        }
        throw new Error(`証明書のダウンロードに失敗: ${errorBody?.detail || response.statusText}`);
      }

      const certPemRaw = await response.text();
      setCertificatePem(certPemRaw);
      setCurrentStep('certificateDownloaded');
      console.log('Certificate downloaded:', certPemRaw);

    } catch (e: any) {
      console.error('Certificate download failed:', e);
      setError(`証明書ダウンロードに失敗しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [certificateUrl, accountId, accountKeys]);

  // Function to simulate HTTP-01 validation by telling the server to prepare for it
  const simulateHttp01Validation = useCallback(async (challenge: AcmeChallenge) => {
    console.log("Simulating HTTP-01 Validation for challenge:", JSON.stringify(challenge, null, 2));
    if (!challenge.id || !challenge.keyAuthorization) {
      setError("チャレンジIDまたはキーオーソリゼーションがありません。ブラウザの開発者コンソールのログを確認してください。");
      console.error("Missing challenge.id or challenge.keyAuthorization for simulateHttp01Validation:", {
        id: challenge.id,
        keyAuth: challenge.keyAuthorization,
        challengeObject: challenge
      });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const apiUrl = `/api/acme/challenge/${challenge.id}/simulate-validation`; // apiUrl を定義
      const response = await fetch(apiUrl, // apiUrl を使用
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ keyAuthorization: challenge.keyAuthorization }), // 修正: payload -> keyAuthorization
        });

      const body = await response.json();
      // if (!response.ok) { // 古いエラーハンドリング。新しいものを下に実装
      //   throw new Error(body.error || `チャレンジ ${challenge.id} の検証シミュレートに失敗しました。`);
      // }
      if (!response.ok) {
        throw new Error(body.detail || `HTTP-01検証シミュレーションAPIの呼び出しに失敗: ${response.statusText}`);
      }
      console.log('HTTP-01 validation simulation successful:', body); // challenge.id を削除し、汎用的なログに変更
      alert("サーバーにHTTP-01チャレンジの検証準備ができたことを通知しました。次に、ステップ4の「チャレンジ対応を通知」ボタンを押してください。");

      // Optimistically update local challenge status or refetch
      // この部分は、サーバーの応答に基づいてステータスを更新する方がより正確ですが、
      // simulate-validation API は直接チャレンジステータスを返さないため、
      // UI上での即時フィードバックとして残すか、あるいは削除して handleCompleteChallenge 後のポーリングに任せるか検討の余地あり。
      // 現状はコメントアウトせずに残すが、もし不要なら削除する。
      setAuthorizations(prevAuths =>
        prevAuths.map(auth => ({
          ...auth,
          challenges: auth.challenges.map(ch =>
            ch.id === challenge.id ? { ...ch, /* status: 'simulated' */ } : ch // 'processing' から 'simulated' 等のカスタムステータスも検討可
          ),
        }))
      );

    } catch (e: any) {
      console.error('Simulating HTTP-01 validation failed:', e); // challenge.id を削除
      setError(`HTTP-01検証のシミュレーションに失敗しました: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const renderJson = (data: object | null | string) => {
    if (!data) return <p className="text-sm text-gray-500">データがありません</p>;
    if (typeof data === 'string') { // Handle PEM string display
        return (
            <pre className="bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto whitespace-pre-wrap">
                {data}
            </pre>
        );
    }
    return (
      <pre className="bg-gray-800 text-white p-4 rounded-md text-xs overflow-x-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 shadow-lg rounded-lg p-6 md:p-8 w-full max-w-2xl mx-auto">
      <h2 className="text-3xl font-bold mb-6 text-center text-indigo-600 dark:text-indigo-400">ACMEプロトコル体験フロー</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 rounded-md">
          <p className="font-semibold">エラー:</p>
          <p>{error}</p>
        </div>
      )}

      {/* Step 1: Generate Keys */}
      <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">ステップ1: アカウントキーペア生成</h3>
        {currentStep === 'initial' && (
          <button
            onClick={generateKeys}
            disabled={loading}
            className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
          >
            {loading ? '生成中...' : 'アカウントキーペアを生成'}
          </button>
        )}
        {accountKeys && currentStep !== 'initial' && (
          <div className="mt-4 space-y-4">
            <div>
              <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">公開鍵 (JWK):</h4>
              {renderJson(accountKeys.publicKey)}
            </div>
            {/* Optionally hide private key after use or show only if needed for debugging */}
            {/* <div>
              <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">秘密鍵 (JWK):</h4>
              {renderJson(accountKeys.privateKey)}
            </div> */}
            <p className="text-sm text-green-600 dark:text-green-400">キーペアが生成されました。</p>
          </div>
        )}
      </section>

      {/* Step 2: Register Account */}
      {(currentStep === 'keysGenerated' || currentStep === 'accountRegistered' || currentStep === 'orderCreated' || currentStep === 'challengeSubmitted' || currentStep === 'finalizationProcessing' || currentStep === 'certificateReady' || currentStep === 'certificateDownloaded') && accountKeys && (
        <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">ステップ2: アカウント登録</h3>
          <div className="mb-4">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">連絡先メールアドレス:</label>
            <input
              type="email"
              id="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
              placeholder="user@example.com"
              disabled={currentStep !== 'keysGenerated' || loading}
            />
          </div>
          {currentStep === 'keysGenerated' && (
            <button
              onClick={handleRegisterAccount}
              disabled={loading || !accountKeys || !contactEmail}
              className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
            >
              {loading ? '登録中...' : 'アカウントを登録'}
            </button>
          )}
          {accountId && (
            <div className="mt-4 p-3 bg-green-100 dark:bg-green-900 border border-green-400 dark:border-green-700 rounded-md">
              <p className="text-sm text-green-700 dark:text-green-200">
                アカウント登録済み (または登録処理完了)。アカウントID (KID):
                <span className="font-mono block break-all text-xs">{accountId}</span>
              </p>
            </div>
          )}
        </section>
      )}

      {/* Step 3: Create Order */}
      {(currentStep === 'accountRegistered' || currentStep === 'orderCreated' || currentStep === 'challengeSubmitted' || currentStep === 'finalizationProcessing' || currentStep === 'certificateReady' || currentStep === 'certificateDownloaded') && accountId && (
         <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
            <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">ステップ3: 証明書オーダー作成</h3>
            <div className="mb-4">
              <label htmlFor="domain" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ドメイン名:</label>
              <input
                type="text"
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white"
                placeholder="example.com"
                disabled={currentStep !== 'accountRegistered' || loading}
              />
            </div>
            {currentStep === 'accountRegistered' && (
              <button
                onClick={handleCreateOrder}
                disabled={loading || !domain || !accountId}
                className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
              >
                {loading ? 'オーダー作成中...' : 'オーダーを作成'}
              </button>
            )}
            {orderUrl && orderData && (
              <>
                {/* {(() => { // problematic log removed
                  console.log("[AcmeClientFlow] Rendering orderData in JSX (Order Details Section):", JSON.stringify(orderData, null, 2));
                  return null;
                })()} */}
                <div className="mt-4 space-y-3">
                  <p className="text-sm text-green-600 dark:text-green-400">オーダーが作成されました。</p>
                  <div>
                      <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">オーダーURL:</h4>
                      <p className="font-mono text-xs break-all bg-gray-100 dark:bg-gray-700 p-2 rounded">{orderUrl}</p>
                  </div>
                  <div>
                      <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">オーダー詳細:</h4>
                      {renderJson(orderData)}
                  </div>
                  {authorizations.length > 0 && (
                    <div>
                      <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">認証情報 ({authorizations.length}):</h4>
                      {authorizations.map((auth, index) => (
                        <div key={index} className="mb-2 p-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-800">
                           <p className="text-xs">ドメイン: {auth.identifier.value}, ステータス: {auth.status}</p>
                           {/* Display full auth object for debugging or details */}
                           {/* {renderJson(auth)} */}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
        </section>
      )}

      {/* Step 4: Handle Challenge */}
      {currentStep === 'orderCreated' && authorizations.length > 0 && (
        <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">ステップ4: ドメイン認証チャレンジ対応</h3>
          {authorizations.map((auth, authIndex) => (
            <div key={authIndex} className="mb-4 p-3 border rounded bg-white shadow-sm">
              <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300">認証対象: {auth.identifier.value}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">ステータス: {auth.status}, 有効期限: {auth.expires ? new Date(auth.expires).toLocaleString() : 'N/A'}</p>
              {auth.challenges && auth.challenges.length > 0 && (
                <div className="mt-2">
                  <h5 className="text-sm font-semibold text-gray-600 dark:text-gray-500">チャレンジ ({auth.challenges.length}):</h5>
                  {auth.challenges.map((challenge, challengeIndex) => (
                    <div key={challenge.id || challengeIndex} className="mt-1 p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 rounded-r-md">
                      <p className="text-sm font-medium">タイプ: <span className="font-mono text-xs">{challenge.type}</span>, ステータス: <span className="font-semibold">{challenge.status}</span></p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">URL: <span className="font-mono break-all">{challenge.url}</span></p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">トークン: <span className="font-mono break-all">{challenge.token}</span></p>
                      {challenge.type === 'http-01' && challenge.keyAuthorization && (
                        <>
                          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                            以下の内容で <code>http://{auth.identifier.value}/.well-known/acme-challenge/{challenge.token}</code> を作成・配置してください:
                          </p>
                          <pre className="mt-1 p-2 bg-gray-100 dark:bg-gray-700 text-xs font-mono break-all rounded-md text-gray-800 dark:text-gray-200">{challenge.keyAuthorization}</pre>
                          {(challenge.status === 'pending' || challenge.status === 'processing') && (
                            <button
                              onClick={() => simulateHttp01Validation(challenge)}
                              disabled={loading}
                              className="mt-3 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-md shadow-sm disabled:opacity-50 transition-colors duration-150 ease-in-out"
                            >
                              {loading ? '処理中...' : `HTTP-01 検証成功をシミュレート (ID: ${challenge.id.substring(0,8)}...)`}
                            </button>
                          )}
                        </>
                      )}
                       {challenge.status === 'valid' && (
                        <p className="mt-2 text-xs text-green-600 dark:text-green-400 font-semibold">検証成功済み</p>
                      )}
                      {challenge.status === 'invalid' && (
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400 font-semibold">検証失敗</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {/* This button is for the overall step, assuming one primary http-01 challenge from http01Challenge state */}
          {http01Challenge && (currentStep === 'orderCreated' || http01Challenge.status === 'pending') && (
            <div className="mt-6 border-t pt-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-2">主要HTTP-01チャレンジ対応完了通知</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                    上記の手順でファイル設置後、CAに検証準備ができたことを通知します。
                    (現在選択されている主要チャレンジ: {http01Challenge.id.substring(0,8)}...)
                </p>
                <button
                  onClick={handleCompleteChallenge} // This posts to challenge.url
                  disabled={loading || !http01Challenge.keyAuthorization}
                  className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
                >
                  {loading ? '通知中...' : 'チャレンジ検証準備完了をCAに通知'}
                </button>
                {http01Challenge.status && http01Challenge.status !== 'pending' && (
                    <p className="mt-3 text-sm">主要チャレンジステータス: <span className="font-semibold">{http01Challenge.status}</span></p>
                )}
            </div>
          )}
        </section>
      )}

      {/* Step 5: Finalize Order */}
      {(currentStep === 'challengeSubmitted' || currentStep === 'finalizationProcessing') && orderData && finalizeUrl && accountId && (
        <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">ステップ5: オーダー最終化</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            ドメイン ({domain}) の認証チャレンジが送信されました (または処理中)。
            CAが検証を完了すると、証明書発行のためにオーダーを最終化できます。
          </p>
          {orderData.status === 'ready' || orderData.status === 'processing' && ( // Show button if ready or still processing from CA side
            <button
                onClick={handleFinalizeOrder}
                disabled={loading || orderData.status !== 'ready'} // Enable only if order is ready
                className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
            >
                {loading ? '最終化処理中...' : 'オーダーを最終化して証明書を発行'}
            </button>
          )}
           {currentStep === 'finalizationProcessing' && orderData.status === 'processing' && (
            <div className="mt-4 text-center">
                <p className="text-sm text-orange-600 dark:text-orange-400">最終化処理中です。現在のオーダーステータス: {orderData.status}</p>
                <button
                    onClick={pollOrderStatus}
                    disabled={loading}
                    className="mt-2 px-4 py-2 bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-800 dark:text-gray-200 font-semibold rounded-md text-sm"
                >
                    {loading ? 'ステータス確認中...' : '最新ステータスを確認'}
                </button>
            </div>
           )}
           {orderData && (orderData.status === 'valid' || orderData.status === 'invalid') && (
             <div className="mt-4">
                <h4 className="text-md font-semibold text-gray-700 dark:text-gray-300 mb-1">最終オーダー状態:</h4>
                {renderJson(orderData)}
             </div>
           )}
        </section>
      )}
       {currentStep === 'orderFinalizationFailed' && orderData && (
         <section className="mb-8 p-6 border border-red-300 dark:border-red-700 rounded-lg bg-red-50 dark:bg-red-900/50">
            <h3 className="text-xl font-semibold mb-4 text-red-700 dark:text-red-300">オーダー最終化失敗/オーダー無効</h3>
            <p className="text-sm text-red-600 dark:text-red-400 mb-3">
              オーダー処理中にエラーが発生しました。詳細は以下の通りです。
              {orderData.error ? renderJson(orderData.error) : (error ? <p>{error}</p> : <p>不明なエラーです。</p>)}
            </p>
            {renderJson(orderData || undefined)}
         </section>
       )}

      {/* Step 6: Download Certificate */}
      {currentStep === 'certificateReady' && certificateUrl && accountId && (
        <section className="mb-8 p-6 border border-green-300 dark:border-green-700 rounded-lg bg-green-50 dark:bg-green-900/50">
          <h3 className="text-xl font-semibold mb-4 text-green-700 dark:text-green-300">ステップ6: 証明書ダウンロード</h3>
          <p className="text-sm text-green-600 dark:text-green-400 mb-3">
            証明書が発行され、ダウンロード準備ができました！
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">証明書ダウンロードURL:</p>
          <p className="font-mono text-xs break-all bg-gray-100 dark:bg-gray-700 p-2 rounded mb-4">{certificateUrl}</p>
          <button
            onClick={handleDownloadCertificate}
            disabled={loading}
            className="w-full px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-md shadow-md disabled:opacity-50 transition-colors duration-150 ease-in-out"
          >
            {loading ? 'ダウンロード中...' : '証明書をダウンロード (PEM)'}
          </button>
        </section>
      )}

      {currentStep === 'certificateDownloaded' && certificatePem && (
        <section className="mb-8 p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50">
          <h3 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">発行された証明書 (PEM形式)</h3>
          {renderJson(certificatePem)}
           <button
            onClick={() => {
                // Reset state to allow another run, but keep keys and accountId if user wants to reuse
                setCurrentStep('accountRegistered'); // Go back to create another order with same account
                setDomain('');
                setOrderUrl(null);
                setOrderData(null);
                setAuthorizations([]);
                setHttp01Challenge(null);
                setFinalizeUrl(null);
                setCertificateUrl(null);
                setCertificatePem(null);
                setError(null);
            }}
            className="mt-6 w-full px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-md shadow-md"
           >
            別のドメインで再試行 (同じアカウントを使用)
           </button>
           <button
            onClick={() => {
                // Full reset
                setCurrentStep('initial');
                setAccountKeys(null);
                setContactEmail('test@example.com');
                setAccountId(null);
                setDomain('');
                setOrderUrl(null);
                setOrderData(null);
                setAuthorizations([]);
                setHttp01Challenge(null);
                setFinalizeUrl(null);
                setCertificateUrl(null);
                setCertificatePem(null);
                setError(null);
            }}
            className="mt-3 w-full px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-md shadow-md"
           >
            最初からやり直す (新しいアカウントキー)
           </button>
        </section>
      )}
    </div>
  );
};

export default AcmeClientFlow;
