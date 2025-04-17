# 100日チャレンジ - day5: WebRTC 動画チャットアプリ

このプロジェクトは [Next.js](https://nextjs.org) (App Router)、TypeScript、WebRTC を使用した100日チャレンジの5日目、シンプルな1対1ビデオチャットアプリです。

## アプリケーション概要

ユーザー同士が 1 対 1 でリアルタイムにビデオ通話を行えるシンプルな Web アプリケーションです。WebRTC を利用して P2P でメディアストリームを交換し、シグナリングには Server-Sent Events (SSE) を使用します。

## 機能一覧

- **1対1ビデオ通話**: 2人のユーザー間で映像と音声を送受信できます。
- **ユーザー識別**: 各ユーザーはシンプルなユーザーIDで識別されます（ログイン機能は不要）。
- **接続開始**: ユーザーは通話したい相手のユーザーIDを指定して接続を開始します。
- **リアルタイム通信**: WebRTC (RTCPeerConnection) を利用して、P2P (Peer-to-Peer) でメディアストリームを交換します。
- **シグナリング**: 通話の接続確立に必要な情報 (SDP Offer/Answer, ICE Candidate) を交換するために、サーバー (Next.js Route Handler) を介したシグナリングを行います。

## 画面構成

- **トップページ (`/`)**:
    - 自分のユーザーIDを入力する欄。
    - 通話したい相手のユーザーIDを入力する欄。
    - 「通話開始」ボタン。
- **チャットページ (`/chat?userId=[自分のID]&peerId=[相手のID]`)**:
    - 自分のビデオ映像を表示する `<video>` 要素。
    - 相手のビデオ映像を表示する `<video>` 要素。
    - 接続状態を示すシンプルな表示。
    - 「通話終了」ボタン。

## シグナリングフロー (シーケンス図)

```mermaid
sequenceDiagram
    participant UserA as ユーザーA (発信側)
    participant UserB as ユーザーB (着信側)
    participant SignalingServer as シグナリングサーバー (SSE)

    UserA->>SignalingServer: GET /api/signaling?userId=A (SSE接続)
    Note over UserA, SignalingServer: SSE接続確立
    UserB->>SignalingServer: GET /api/signaling?userId=B (SSE接続)
    Note over UserB, SignalingServer: SSE接続確立

    UserA->>UserA: RTCPeerConnection作成
    UserA->>UserA: メディア取得 & トラック追加
    UserA->>UserA: Offer (SDP) 作成

    UserA->>SignalingServer: POST /api/signaling?targetUserId=B (Offer送信)
    SignalingServer->>UserB: SSE data: { type: "offer", sdp: ... }

    UserB->>UserB: Offer受信 & リモート設定
    UserB->>UserB: RTCPeerConnection作成
    UserB->>UserB: メディア取得 & トラック追加
    UserB->>UserB: Answer (SDP) 作成

    UserB->>SignalingServer: POST /api/signaling?targetUserId=A (Answer送信)
    SignalingServer->>UserA: SSE data: { type: "answer", sdp: ... }

    UserA->>UserA: Answer受信 & リモート設定

    loop ICE Candidate 交換
        UserA->>UserA: ICE Candidate 生成
        UserA->>SignalingServer: POST /api/signaling?targetUserId=B (Candidate送信)
        SignalingServer->>UserB: SSE data: { type: "candidate", candidate: ... }
        UserB->>UserB: Candidate 受信 & 追加

        UserB->>UserB: ICE Candidate 生成
        UserB->>SignalingServer: POST /api/signaling?targetUserId=A (Candidate送信)
        SignalingServer->>UserA: SSE data: { type: "candidate", candidate: ... }
        UserA->>UserA: Candidate 受信 & 追加
    end

    Note over UserA, UserB: P2P接続確立

```

## 開始方法

1. **依存パッケージをインストール**
   ```bash
   npm install
   ```

2. **開発サーバーを起動**
   ```bash
   npm run dev
   ```
   ブラウザで [http://localhost:3001](http://localhost:3001) を開くと結果が表示されます。

## 注意事項

- このテンプレートはローカル開発環境を主眼としています。
- 本番デプロイには追加の考慮が必要です。
- エラーハンドリングやセキュリティは簡略化されています。
- シグナリングサーバーはメモリ上でクライアントを管理するため、サーバーを再起動すると接続情報が失われます。
- TURNサーバーを実装していないため、特定のネットワーク環境下では接続できない場合があります。
