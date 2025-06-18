class BitcoinBlockchainUI {
    constructor() {
        this.apiBase = '/api';
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadInitialData();
        this.startAutoRefresh();
    }

    bindEvents() {
        // リフレッシュボタン
        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.loadInitialData();
        });

        // ウォレット作成
        document.getElementById('create-wallet-btn').addEventListener('click', () => {
            this.createWallet();
        });

        // トランザクション送信
        document.getElementById('transaction-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.sendTransaction();
        });

        // マイニング制御
        document.getElementById('mine-block-btn').addEventListener('click', () => {
            this.mineBlock();
        });

        document.getElementById('start-auto-mining').addEventListener('click', () => {
            this.startAutoMining();
        });

        document.getElementById('stop-auto-mining').addEventListener('click', () => {
            this.stopAutoMining();
        });

        document.getElementById('validate-chain-btn').addEventListener('click', () => {
            this.validateChain();
        });
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadSystemInfo(),
                this.loadBlocks(),
                this.loadWallets()
            ]);
        } catch (error) {
            this.showToast('データ読み込みエラー: ' + error.message, 'error');
        }
    }

    async loadSystemInfo() {
        try {
            const response = await fetch(`${this.apiBase}/info`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'システム情報取得失敗');
            }

            document.getElementById('block-height').textContent = data.height;
            document.getElementById('total-transactions').textContent = data.total_transactions.toLocaleString();
            document.getElementById('total-utxos').textContent = data.total_utxos.toLocaleString();
            document.getElementById('mempool-size').textContent = data.mempool_size;
            document.getElementById('total-value').textContent = data.total_value.toLocaleString() + ' satoshi';
            document.getElementById('avg-block-size').textContent = data.average_block_size.toFixed(2) + ' bytes';
            document.getElementById('difficulty').textContent = data.difficulty;
        } catch (error) {
            console.error('システム情報取得エラー:', error);
            throw error;
        }
    }

    async loadBlocks() {
        try {
            const response = await fetch(`${this.apiBase}/blocks`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'ブロック情報取得失敗');
            }

            const container = document.getElementById('recent-blocks');
            container.innerHTML = '';

            if (data.blocks && data.blocks.length > 0) {
                data.blocks.forEach(block => {
                    const blockElement = this.createBlockElement(block);
                    container.appendChild(blockElement);
                });
            } else {
                container.innerHTML = '<p class="text-gray-500">ブロックがありません</p>';
            }
        } catch (error) {
            console.error('ブロック情報取得エラー:', error);
            throw error;
        }
    }

    async loadWallets() {
        try {
            const response = await fetch(`${this.apiBase}/wallets`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'ウォレット情報取得失敗');
            }

            const container = document.getElementById('wallet-list');
            const fromSelect = document.getElementById('from-address');
            const toSelect = document.getElementById('to-address');
            const minerSelect = document.getElementById('miner-address');

            // ウォレットリストをクリア
            container.innerHTML = '';
            fromSelect.innerHTML = '<option value="">ウォレットを選択</option>';
            toSelect.innerHTML = '<option value="">ウォレットを選択</option>';
            minerSelect.innerHTML = '<option value="">マイナーを選択</option>';

            if (data.wallets && data.wallets.length > 0) {
                data.wallets.forEach(wallet => {
                    // ウォレットリスト表示
                    const walletElement = this.createWalletElement(wallet);
                    container.appendChild(walletElement);

                    // セレクトボックスに追加
                    const optionText = `${wallet.address.substring(0, 16)}... (${(wallet.balance / 100000000).toFixed(2)} BTC)`;
                    const option1 = new Option(optionText, wallet.address);
                    const option2 = new Option(optionText, wallet.address);
                    const option3 = new Option(optionText, wallet.address);

                    fromSelect.appendChild(option1);
                    toSelect.appendChild(option2);
                    minerSelect.appendChild(option3);
                });
            } else {
                container.innerHTML = '<p class="text-gray-500">ウォレットがありません</p>';
            }
        } catch (error) {
            console.error('ウォレット情報取得エラー:', error);
            throw error;
        }
    }

    createBlockElement(block) {
        const div = document.createElement('div');
        div.className = 'border border-gray-600 rounded-lg p-4 hover:bg-gray-700 transition bg-gray-800';

        const timestamp = new Date(block.timestamp * 1000);

        div.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="text-sm font-medium text-yellow-400">ブロック #${block.height}</span>
                <span class="text-xs text-gray-400">${timestamp.toLocaleString('ja-JP')}</span>
            </div>
            <div class="text-xs text-gray-300 space-y-1">
                <div><strong>ハッシュ:</strong> <span class="font-mono">${block.hash ? block.hash.substring(0, 32) + '...' : 'N/A'}</span></div>
                <div><strong>前ブロック:</strong> <span class="font-mono">${block.prev_hash ? block.prev_hash.substring(0, 32) + '...' : 'N/A'}</span></div>
                <div class="flex justify-between">
                    <span><strong>ナンス:</strong> ${block.nonce ? block.nonce.toLocaleString() : 'N/A'}</span>
                    <span><strong>Tx:</strong> ${block.transactions || 0}</span>
                </div>
            </div>
        `;

        return div;
    }

    createWalletElement(wallet) {
        const div = document.createElement('div');
        div.className = 'border border-gray-600 rounded-lg p-3 hover:bg-gray-700 transition bg-gray-800';

        const btcBalance = (wallet.balance / 100000000).toFixed(8);

        div.innerHTML = `
            <div class="flex justify-between items-center">
                <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-white truncate font-mono">
                        ${wallet.address.substring(0, 20)}...
                    </div>
                    <div class="text-xs text-gray-400">
                        ${wallet.balance.toLocaleString()} satoshi
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-sm font-bold text-yellow-400">
                        ${btcBalance} BTC
                    </div>
                </div>
            </div>
        `;

        return div;
    }

    async createWallet() {
        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/wallets/create`, {
                method: 'POST'
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'ウォレット作成失敗');
            }

            this.showToast(`ウォレット作成成功: ${data.address.substring(0, 16)}...`, 'success');
            await this.loadWallets();
        } catch (error) {
            this.showToast('ウォレット作成エラー: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async sendTransaction() {
        const from = document.getElementById('from-address').value;
        const to = document.getElementById('to-address').value;
        const amount = parseInt(document.getElementById('amount').value);

        if (!from || !to || !amount || amount <= 0) {
            this.showToast('送信者、受信者、金額を正しく入力してください', 'error');
            return;
        }

        if (from === to) {
            this.showToast('送信者と受信者が同じです', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/transactions/send`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ from, to, amount })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'トランザクション送信失敗');
            }

            this.showToast(`トランザクション送信成功: ${data.transaction_id.substring(0, 16)}...`, 'success');
            document.getElementById('amount').value = '';
            await this.loadSystemInfo();
        } catch (error) {
            this.showToast('トランザクション送信エラー: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async mineBlock() {
        const minerAddress = document.getElementById('miner-address').value;
        if (!minerAddress) {
            this.showToast('マイナーを選択してください', 'error');
            return;
        }

        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/mining/mine`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ miner_address: minerAddress })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'マイニング失敗');
            }

            this.showToast(`マイニング成功! ナンス: ${data.nonce}, 時間: ${data.duration}`, 'success');
            await this.loadInitialData();
        } catch (error) {
            this.showToast('マイニングエラー: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async startAutoMining() {
        const minerAddress = document.getElementById('miner-address').value;
        if (!minerAddress) {
            this.showToast('マイナーを選択してください', 'error');
            return;
        }

        try {
            const response = await fetch(`${this.apiBase}/mining/start`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ miner_address: minerAddress })
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '自動マイニング開始失敗');
            }

            this.showToast('自動マイニングを開始しました', 'success');
        } catch (error) {
            this.showToast('自動マイニング開始エラー: ' + error.message, 'error');
        }
    }

    async stopAutoMining() {
        try {
            const response = await fetch(`${this.apiBase}/mining/stop`, {
                method: 'POST'
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '自動マイニング停止失敗');
            }

            this.showToast('自動マイニングを停止しました', 'success');
        } catch (error) {
            this.showToast('自動マイニング停止エラー: ' + error.message, 'error');
        }
    }

    async validateChain() {
        this.showLoading(true);
        try {
            const response = await fetch(`${this.apiBase}/validate`, {
                method: 'POST'
            });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'チェーン検証失敗');
            }

            this.showToast('ブロックチェーンの整合性確認完了', 'success');
        } catch (error) {
            this.showToast('チェーン検証エラー: ' + error.message, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');

        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500',
            warning: 'bg-yellow-500'
        };

        const icons = {
            success: 'fa-check-circle',
            error: 'fa-exclamation-circle',
            info: 'fa-info-circle',
            warning: 'fa-exclamation-triangle'
        };

        toast.className = `${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg flex items-center space-x-2 transform translate-x-full transition-transform duration-300`;
        toast.innerHTML = `
            <i class="fas ${icons[type]}"></i>
            <span>${message}</span>
            <button class="ml-2 text-white hover:text-gray-200" onclick="this.parentElement.remove()">
                <i class="fas fa-times"></i>
            </button>
        `;

        container.appendChild(toast);

        // アニメーション表示
        setTimeout(() => {
            toast.classList.remove('translate-x-full');
        }, 100);

        // 自動削除
        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('translate-x-full');
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 300);
            }
        }, 5000);
    }

    showLoading(show) {
        const overlay = document.getElementById('loading-overlay');
        if (show) {
            overlay.classList.remove('hidden');
        } else {
            overlay.classList.add('hidden');
        }
    }

    startAutoRefresh() {
        // 30秒ごとに自動更新
        setInterval(() => {
            this.loadSystemInfo();
        }, 30000);

        // 60秒ごとにブロック一覧を更新
        setInterval(() => {
            this.loadBlocks();
        }, 60000);
    }
}

// ページ読み込み完了時にアプリケーションを初期化
document.addEventListener('DOMContentLoaded', () => {
    new BitcoinBlockchainUI();
});
