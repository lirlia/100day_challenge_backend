'use client';

import { useState, useEffect } from 'react';
import { nanoid } from 'nanoid';

// PKCE helper functions
function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(array: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

interface UserInfo {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
  preferred_username?: string;
}

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // OAuth設定
  const OAUTH_CONFIG = {
    clientId: '4127463f-af22-4f1e-aecb-fb178082eacb',
    redirectUri: 'http://localhost:3001/callback',
    scope: 'openid profile email',
    responseType: 'code',
    providerUrl: 'http://localhost:8081'
  };

  useEffect(() => {
    // ページロード時にローカルストレージからトークンを復元
    const token = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('user_info');

    if (token && userStr) {
      setAccessToken(token);
      setUserInfo(JSON.parse(userStr));
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async () => {
    setLoading(true);

    try {
      // PKCE チャレンジ生成
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // 状態パラメータ生成
      const state = nanoid();

      // PKCEとstateをセッションストレージに保存
      sessionStorage.setItem('code_verifier', codeVerifier);
      sessionStorage.setItem('oauth_state', state);

      // OAuth認証URLに遷移
      const authUrl = new URL(`${OAUTH_CONFIG.providerUrl}/authorize`);
      authUrl.searchParams.set('client_id', OAUTH_CONFIG.clientId);
      authUrl.searchParams.set('redirect_uri', OAUTH_CONFIG.redirectUri);
      authUrl.searchParams.set('response_type', OAUTH_CONFIG.responseType);
      authUrl.searchParams.set('scope', OAUTH_CONFIG.scope);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('user_id', 'bf3e5ff7-32b5-426f-8e2d-3d56e81d10a5'); // デモ用のユーザーID

      window.location.href = authUrl.toString();
    } catch (error) {
      console.error('Login error:', error);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUserInfo(null);
    setAccessToken(null);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    sessionStorage.clear();
  };

  const fetchProtectedResource = async () => {
    if (!accessToken) return;

    try {
      const response = await fetch(`${OAUTH_CONFIG.providerUrl}/userinfo`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Protected resource:', data);
        alert(`Protected resource fetched: ${JSON.stringify(data, null, 2)}`);
      } else {
        console.error('Failed to fetch protected resource');
        alert('Failed to fetch protected resource');
      }
    } catch (error) {
      console.error('Error fetching protected resource:', error);
      alert('Error fetching protected resource');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-green-500 p-6">
      {/* Header */}
      <header className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold text-white">Day59 - OIDC React Client</h1>
        {isAuthenticated && (
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-500/20 border border-red-300/30 rounded-lg text-white hover:bg-red-500/30 transition-all duration-300 backdrop-blur-lg"
          >
            ログアウト
          </button>
        )}
      </header>

      <div className="max-w-4xl mx-auto">
        {/* Main Card */}
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 mb-8 shadow-2xl">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-white mb-4">OAuth2/OpenID Connect</h2>
            <p className="text-xl text-white/80 mb-2">認証デモアプリケーション</p>
            <p className="text-white/60">
              Day59で構築したOAuth2/OpenID Connect Providerとセキュアに連携し、PKCE対応の
              Authorization Code Flowによる認証を実装しています。
            </p>
          </div>

          {!isAuthenticated ? (
            <div className="bg-yellow-500/20 border border-yellow-300/30 rounded-xl p-6 text-center">
              <div className="text-6xl mb-4">🔒</div>
              <h3 className="text-2xl font-semibold text-white mb-4">未認証</h3>
              <p className="text-white/80 mb-6">OAuth2/OpenID Connectフローを体験するには、ログインしてください。</p>
              <button
                onClick={handleLogin}
                disabled={loading}
                className="inline-flex items-center px-6 py-3 bg-blue-600/80 border border-blue-400/30 rounded-lg text-white font-medium hover:bg-blue-600/90 transition-all duration-300 backdrop-blur-lg disabled:opacity-50"
              >
                🚀 OAuth2でログイン
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-green-500/20 border border-green-300/30 rounded-xl p-6 text-center">
                <div className="text-6xl mb-4">✅</div>
                <h3 className="text-2xl font-semibold text-white mb-2">認証完了</h3>
                <p className="text-white/80">OAuth2/OpenID Connect認証が正常に完了しました。</p>
              </div>

              {userInfo && (
                <div className="bg-blue-500/20 border border-blue-300/30 rounded-xl p-6">
                  <h4 className="text-xl font-semibold text-white mb-4">👤 ユーザー情報</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white/80">
                    <div>
                      <strong>User ID:</strong> {userInfo.sub}
                    </div>
                    {userInfo.name && (
                      <div>
                        <strong>Name:</strong> {userInfo.name}
                      </div>
                    )}
                    {userInfo.email && (
                      <div>
                        <strong>Email:</strong> {userInfo.email}
                      </div>
                    )}
                    {userInfo.preferred_username && (
                      <div>
                        <strong>Username:</strong> {userInfo.preferred_username}
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={fetchProtectedResource}
                  className="px-6 py-3 bg-green-600/80 border border-green-400/30 rounded-lg text-white font-medium hover:bg-green-600/90 transition-all duration-300 backdrop-blur-lg"
                >
                  👥 プロフィール
                </button>
                <button
                  onClick={() => alert('保護されたページ機能のデモです')}
                  className="px-6 py-3 bg-purple-600/80 border border-purple-400/30 rounded-lg text-white font-medium hover:bg-purple-600/90 transition-all duration-300 backdrop-blur-lg"
                >
                  📄 保護されたページ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <FeatureCard
            icon="🔑"
            title="OAuth2/OIDC 準拠"
            description="標準的なOAuth2 Authorization Code FlowとOpenID Connectに完全対応し実装"
          />
          <FeatureCard
            icon="🛡"
            title="PKCE対応"
            description="Proof Key for Code Exchange (PKCE) によるセキュアなフロー対応"
          />
          <FeatureCard
            icon="🔒"
            title="セキュアなセッション"
            description="HTTPOnlyクッキーによるセキュアなセッション管理とトークンの安全な保存"
          />
          <FeatureCard
            icon="🔄"
            title="自動トークン更新"
            description="Refresh Tokenによる自動的なアクセストークン更新機能"
          />
          <FeatureCard
            icon="🎨"
            title="グラスモーフィズム"
            description="モダンなグラスモーフィズムデザインによる美しいユーザーインターフェース"
          />
          <FeatureCard
            icon="⚡"
            title="Next.js 15"
            description="最新のNext.js App Routerによる効率的なフロントエンド開発・実行"
          />
        </div>

        {/* Tech Stack */}
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h3 className="text-2xl font-bold text-white mb-6 text-center">技術スタック</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <TechBadge icon="⚛️" label="React 19" subtitle="最新のReact" />
            <TechBadge icon="▲" label="Next.js 15" subtitle="App Router" />
            <TechBadge icon="🎨" label="Tailwind CSS" subtitle="v3 最新版" />
            <TechBadge icon="🔐" label="OAuth2/OIDC" subtitle="自作実装" />
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-xl p-6 hover:bg-white/15 transition-all duration-300">
      <div className="text-4xl mb-4">{icon}</div>
      <h4 className="text-lg font-semibold text-white mb-2">{title}</h4>
      <p className="text-white/70 text-sm">{description}</p>
    </div>
  );
}

function TechBadge({ icon, label, subtitle }: { icon: string; label: string; subtitle: string }) {
  return (
    <div className="text-center">
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-white font-medium">{label}</div>
      <div className="text-white/60 text-sm">{subtitle}</div>
    </div>
  );
}
