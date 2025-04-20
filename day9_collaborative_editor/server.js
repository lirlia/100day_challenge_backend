const WebSocket = require('ws');
const ShareDB = require('sharedb');
const richText = require('rich-text');
const { EventEmitter } = require('events'); // Import EventEmitter

// WebSocket を ShareDB が期待するストリームインターフェースにラップするクラス
class WebSocketJSONStream extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;
    console.log('[Debug][Stream] WebSocketJSONStream created for a connection.');

    this.ws.on('message', (message) => {
      console.log('[Debug][Stream] Received message from client:', message.toString());
      try {
        // ShareDBは通常JSONを期待するため、文字列からパース
        // クライアントもJSON文字列で送信する必要があることに注意
        this.emit('data', JSON.parse(message.toString()));
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
        this.emit('error', err);
      }
    });

    this.ws.on('close', () => {
      this.emit('close');
      this.emit('end');
    });

    this.ws.on('error', (error) => {
      this.emit('error', error);
    });
  }

  write(data) {
    console.log('[Debug][Stream] Writing data to client:', data);
    try {
      // ShareDBからのデータをJSON文字列に変換して送信
      this.ws.send(JSON.stringify(data));
    } catch (err) {
        console.error('Error stringifying or sending WebSocket message:', err);
        // エラー発生時もストリームエラーをemitするべきかもしれない
        // this.emit('error', err);
    }
  }

  end() {
    this.ws.close();
  }
}

ShareDB.types.register(richText.type);

// Enable presence
const backend = new ShareDB({ presence: true });

// 接続クライアント情報 (ID と 色)
const clients = new Map();
const colors = [
    '#ff6347', '#4682b4', '#32cd32', '#ffc0cb', '#ffa500', '#9370db',
    '#e9967a', '#87cefa', '#da70d6', '#ffd700', '#add8e6', '#f08080'
];
let colorIndex = 0;

function generateUniqueId() {
    return Math.random().toString(36).substring(2, 15);
}

// ShareDBサーバーを起動
function startServer() {
  const wss = new WebSocket.Server({ port: 8080 });
  console.log('WebSocket server started on port 8080 (Presence enabled)');

  wss.on('connection', (ws) => {
    const clientId = generateUniqueId();
    const clientColor = colors[colorIndex % colors.length];
    colorIndex++;
    clients.set(ws, { id: clientId, color: clientColor }); // Use ws object as key for simplicity
    console.log(`Client connected: ${clientId} (${clientColor})`);

    // Send client info (ID and Color) via custom message
    ws.send(JSON.stringify({
      type: 'client_info',
      clientId,
      clientColor
    }));

    // WebSocket接続をカスタムストリームでラップ
    const stream = new WebSocketJSONStream(ws);
    backend.listen(stream);

    // Clean up on close/error
    const cleanup = () => {
        const clientInfo = clients.get(ws);
        if (clientInfo) {
            console.log(`Client disconnected: ${clientInfo.id} (${clientInfo.color})`);
            clients.delete(ws);
            // TODO: Optionally, notify other users about disconnection via presence or custom message
        }
    };
    ws.on('close', cleanup);
    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${clientId}:`, error);
        cleanup();
    });

  });

  // 初期ドキュメントを作成（メモリ上に保持）
  const connection = backend.connect();
  const doc = connection.get('documents', 'default'); // Collection 'documents', Document ID 'default'

  doc.fetch((err) => {
    if (err) throw err;
    if (doc.type === null) {
      // ドキュメントが存在しない場合は初期内容で作成
      doc.create([{ insert: '# HackMD Collaborative Editor\n\nStart typing...\n' }], richText.type.name, (err) => {
        if (err) throw err;
        console.log('Initial document created');
      });
    } else {
      console.log('Document already exists');
    }
  });
}

startServer();
