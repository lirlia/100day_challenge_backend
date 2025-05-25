# Day 48: GUI Terminal Emulator

Go言語とFyneライブラリを使用して、基本的なGUIターミナルエミュレータを作成します。
このプロジェクトの主な目的は、pty (pseudo-terminal) の仕組みを理解し、GUIアプリケーションとの連携を学ぶことです。

## 主な機能 (目標)

- ユーザーがコマンドを入力できるGUIインターフェース。
- 入力されたコマンドをOSのシェルに送信し、実行する機能。
- シェルからの出力をGUI上に表示する機能。
- (オプション) 基本的なANSIエスケープシーケンス（色など）のサポート。

## 技術スタック

- 言語: Go
- ptyライブラリ: [creack/pty](https://github.com/creack/pty)
- GUIライブラリ: [Fyne](https://fyne.io/)

## 開発ステップ

1.  pty制御ロジックの実装とCUIでのテスト。
2.  Fyneを使用した基本的なGUIウィンドウの作成。
3.  pty制御ロジックとGUIの結合。
4.  テストと調整。
