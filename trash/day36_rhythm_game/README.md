# Day 36: Rhythm Game Backend

ポップンミュージック風のリズムゲームのバックエンド API およびシンプルなフロントエンドを実装します。

## 概要

上から降ってくるノーツに合わせてキーを叩くリズムゲームです。バックエンドで曲データ、譜面データ、ハイスコアを管理し、フロントエンドでゲームプレイと表示を行います。

## 技術スタック

- Next.js (App Router)
- TypeScript
- Tailwind CSS (ニューモーフィズムデザイン)
- SQLite (better-sqlite3)
- Biome

## 機能

- **バックエンド API (`/api/`)**
  - 曲リストの取得 (`GET /songs`)
  - 譜面データの取得 (`GET /songs/:songId/notes?difficulty=easy|hard`)
  - スコアの記録 (`POST /scores`)
  - 曲別ハイスコアランキングの取得 (`GET /scores?songId=:songId`)
- **フロントエンド**
  - 曲選択画面
  - シンプルなゲームプレイ画面 (3キー/6キー、`a` `s` `d` `j` `k` `l` キー対応)
  - スコア表示
  - ユーザー切り替えUI

## データベーススキーマ (`lib/db.ts`)

- `songs`: 曲情報 (id, title, artist, bpm, easyNotesId, hardNotesId)
- `notes`: 譜面データ (id, notesData: JSON)
- `scores`: スコア記録 (id, userId, songId, score, createdAt)

## 起動方法

```bash
npm install
npm run dev # http://localhost:3001 で起動
```
