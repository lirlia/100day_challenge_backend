const WebSocket = require('ws');
const ShareDB = require('sharedb');
const richText = require('rich-text');
const { EventEmitter } = require('events'); // Import EventEmitter

// WebSocket を ShareDB が期待するストリームインターフェースにラップするクラス
class WebSocketJSONStream extends EventEmitter {
  constructor(ws) {
    super();
    this.ws = ws;

    this.ws.on('message', (message) => {
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

const backend = new ShareDB();

// ShareDBサーバーを起動
function startServer() {
  const wss = new WebSocket.Server({ port: 8080 });
  console.log('WebSocket server started on port 8080');

  wss.on('connection', (ws) => {
    console.log('Client connected');
    // WebSocket接続をカスタムストリームでラップ
    const stream = new WebSocketJSONStream(ws);
    backend.listen(stream); // ラップしたストリームを渡す

    // ws 自体のイベントリスナーは WebSocketJSONStream 内で処理されるため、
    // ここでの ws.on('close') や ws.on('error') は不要になる場合があるが、
    // 念のため残しておくか、stream のイベントとして監視することも検討。
    // stream.on('close', () => { console.log('Stream closed'); });
    // stream.on('error', (err) => { console.error('Stream error:', err); });
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