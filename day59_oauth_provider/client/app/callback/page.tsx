'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const OAUTH_CONFIG = {
    clientId: '4127463f-af22-4f1e-aecb-fb178082eacb',
    clientSecret: 'd3a8209a-ccd0-4e47-96ca-3122f47e8c91',
    redirectUri: 'http://localhost:3001/callback',
    providerUrl: 'http://localhost:8081'
  }

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code')
        const state = searchParams.get('state')
        const error = searchParams.get('error')

        // エラーチェック
        if (error) {
          const errorDescription = searchParams.get('error_description') || 'Unknown error'
          setError(`OAuth Error: ${error} - ${errorDescription}`)
          setLoading(false)
          return
        }

        if (!code) {
          setError('Authorization code not found')
          setLoading(false)
          return
        }

        // State検証
        const storedState = sessionStorage.getItem('oauth_state')
        if (state !== storedState) {
          setError('Invalid state parameter')
          setLoading(false)
          return
        }

        // Code verifier取得
        const codeVerifier = sessionStorage.getItem('code_verifier')
        if (!codeVerifier) {
          setError('Code verifier not found')
          setLoading(false)
          return
        }

        // トークン交換
        const tokenResponse = await fetch(`${OAUTH_CONFIG.providerUrl}/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: OAUTH_CONFIG.redirectUri,
            client_id: OAUTH_CONFIG.clientId,
            client_secret: OAUTH_CONFIG.clientSecret,
            code_verifier: codeVerifier,
          }),
        })

        if (!tokenResponse.ok) {
          const errorData = await tokenResponse.json()
          setError(`Token exchange failed: ${errorData.error_description || errorData.error}`)
          setLoading(false)
          return
        }

        const tokenData = await tokenResponse.json()
        const { access_token, id_token, refresh_token } = tokenData

        // アクセストークンを保存
        localStorage.setItem('access_token', access_token)
        if (refresh_token) {
          localStorage.setItem('refresh_token', refresh_token)
        }

        // ユーザー情報を取得
        const userInfoResponse = await fetch(`${OAUTH_CONFIG.providerUrl}/userinfo`, {
          headers: {
            'Authorization': `Bearer ${access_token}`,
          },
        })

        if (userInfoResponse.ok) {
          const userInfo = await userInfoResponse.json()
          localStorage.setItem('user_info', JSON.stringify(userInfo))
        }

        // ID Token がある場合は解析（簡易実装）
        if (id_token) {
          try {
            const payload = JSON.parse(atob(id_token.split('.')[1]))
            console.log('ID Token payload:', payload)
          } catch (e) {
            console.error('Failed to parse ID token:', e)
          }
        }

        // セッションクリア
        sessionStorage.removeItem('code_verifier')
        sessionStorage.removeItem('oauth_state')

        // メインページにリダイレクト
        router.push('/')

      } catch (err) {
        console.error('Callback error:', err)
        setError('An unexpected error occurred')
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-green-500 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <h2 className="text-2xl font-bold text-white mb-2">認証処理中...</h2>
          <p className="text-white/80">OAuth2認証フローを完了しています</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-green-500 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-lg border border-white/20 rounded-2xl p-8 text-center max-w-md">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-bold text-white mb-4">認証エラー</h2>
          <p className="text-white/80 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-600/80 border border-blue-400/30 rounded-lg text-white font-medium hover:bg-blue-600/90 transition-all duration-300 backdrop-blur-lg"
          >
            ホームに戻る
          </button>
        </div>
      </div>
    )
  }

  return null
}
