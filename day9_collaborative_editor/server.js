const WebSocket = require('ws');
const ot = require('ot'); // TODO: ot.js の型定義がないため any で扱うか、自作する

const wss = new WebSocket.Server({ port: 8080 });

// ドキュメント状態 (インメモリ)
let documentContent = '';
let revision = 0;
const clients = new Map(); // clientId -> { ws: WebSocket, color: string, selection: any }

// 色の候補
const colors = [
    '#ff6347', // Tomato
    '#4682b4', // SteelBlue
    '#32cd32', // LimeGreen
    '#ffc0cb', // Pink
    '#ffa500', // Orange
    '#9370db', // MediumPurple
];
let colorIndex = 0;

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
    const clientId = generateUniqueId();
    const clientColor = colors[colorIndex % colors.length];
    colorIndex++;

    clients.set(clientId, { ws, color: clientColor, selection: null });
    console.log(`Client ${clientId} connected with color ${clientColor}`);

    // --- 初期状態を送信 ---
    // クライアントに現在のドキュメント内容、リビジョン、自身のIDと色、他のクライアント情報を送信
    const initialData = {
        type: 'init',
        clientId,
        clientColor,
        document: documentContent,
        revision,
        clients: Array.from(clients.entries()).map(([id, data]) => ({ id, color: data.color, selection: data.selection })),
    };
    ws.send(JSON.stringify(initialData));

    // --- 他のクライアントに新しい接続を通知 ---
    broadcast({ type: 'user_joined', clientId, color: clientColor }, ws); // 自分以外に通知

    // --- メッセージ受信処理 ---
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log(`Received from ${clientId}:`, data);

            if (data.type === 'operation') {
                // TODO: Apply operation using ot.js and broadcast
                console.log('Operation received, broadcasting for now...');
                broadcast(JSON.stringify({ type: 'operation_ack', clientId, ...data }), ws); // 仮実装: ACKとして送り返す
            } else if (data.type === 'selection') {
                // カーソル/選択範囲の更新
                const clientData = clients.get(clientId);
                if (clientData) {
                    clientData.selection = data.selection;
                    broadcast(JSON.stringify({ type: 'selection_update', clientId, selection: data.selection }), ws);
                }
            }
        } catch (error) {
            console.error('Failed to process message or invalid JSON:', message.toString(), error);
        }
    });

    // --- 切断処理 ---
    ws.on('close', () => {
        console.log(`Client ${clientId} disconnected`);
        clients.delete(clientId);
        // 他のクライアントに切断を通知
        broadcast(JSON.stringify({ type: 'user_left', clientId }));
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        // エラー時も切断処理を行う
        if (clients.has(clientId)) {
            clients.delete(clientId);
            broadcast(JSON.stringify({ type: 'user_left', clientId }));
        }
    });
});

// --- ヘルパー関数 ---
function broadcast(message, senderWs = null) {
    const messageString = typeof message === 'string' ? message : JSON.stringify(message);
    clients.forEach(({ ws }) => {
        if (ws !== senderWs && ws.readyState === WebSocket.OPEN) {
            ws.send(messageString);
        }
    });
}

function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15);
}

// TODO: Add ot.js integration for handling operations
// const textOperation = new ot.TextOperation();
// const serverAdapter = new ot.EditorSocketIOServer(documentContent, [], 'docId', (socket, cb) => {
//     // ... authentication/validation logic ...
//     cb(true);
// });