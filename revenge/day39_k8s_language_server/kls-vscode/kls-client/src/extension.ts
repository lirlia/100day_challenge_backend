import * as path from "path";
import * as vscode from "vscode";
import {
	LanguageClient,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export function activate(ctx: vscode.ExtensionContext) {
	// ★ サーバーバイナリへのパス（今回は cargo build / go build 済みの ./kls と仮定）
	const serverExe = ctx.asAbsolutePath(
		path.join("..", "..", "kls")
	);

	const serverOptions = {
		run: { command: serverExe, transport: TransportKind.stdio },
		debug: { command: serverExe, args: ["-log", "debug"], transport: TransportKind.stdio },
	};

	const clientOptions = {
		// YAML をターゲットにする例
		documentSelector: [{ scheme: "file", language: "yaml" }],
		// ファイル監視（診断が必要なら）
		synchronize: {
			fileEvents: vscode.workspace.createFileSystemWatcher("**/*.yaml"),
		},
	};

	client = new LanguageClient(
		"kubernetesLanguageServer",
		"Kubernetes Language Server",
		serverOptions,
		clientOptions
	);

	/* ① LSP を起動（戻りは Promise<void>） */
	client.start().then(() => {
		console.log("KLS started");
	});

	/* ② dispose 可能なオブジェクトを登録 */
	ctx.subscriptions.push(client); // LanguageClient 自体が Disposable
}

export function deactivate(): Thenable<void> | undefined {
	return client?.stop();
}
