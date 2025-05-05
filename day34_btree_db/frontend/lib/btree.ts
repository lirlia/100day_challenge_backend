import { v4 as uuidv4 } from 'uuid';

// B-Tree Node Class
export class BTreeNode {
    id: string;         // Visualization 用の一意な ID
    keys: number[] = [];
    children: BTreeNode[] = [];
    isLeaf: boolean;
    t: number;          // B-Tree の次数 (minimum degree)
    parent: BTreeNode | null = null; // 親ノードへの参照 (削除や分割で必要)

    // アニメーション用状態（例）
    highlight: 'search' | 'insert' | 'delete' | 'path' | 'found' | 'split' | 'merge' | 'borrow' | null = null;
    operationTarget: boolean = false; // 操作対象のキー/ノード
    statusText: string | null = null; // ノードに表示する一時的なテキスト
    comparingKeyIndex: number | null = null;
    transientValue: { value: number; keyIndex: number } | null = null; // ★一時表示値と位置

    constructor(t: number, isLeaf: boolean) {
        this.id = uuidv4();
        this.t = t;
        this.isLeaf = isLeaf;
    }

    // キーを探索 (線形探索)
    findKey(k: number): number {
        let idx = 0;
        while (idx < this.keys.length && k > this.keys[idx]) {
            idx++;
        }
        return idx;
    }

    // ノードが満杯かどうか
    isFull(): boolean {
        return this.keys.length === 2 * this.t - 1;
    }

    // キーの削除 (単純な削除)
    removeKey(k: number): void {
        const idx = this.findKey(k);
        if (idx < this.keys.length && this.keys[idx] === k) {
            this.keys.splice(idx, 1);
        } else {
            // console.warn(`Key ${k} not found in node ${this.id} for removal`);
        }
    }

    // 子の削除 (単純な削除)
    removeChild(idx: number): void {
        if (idx >= 0 && idx < this.children.length) {
            this.children.splice(idx, 1);
        } else {
            // console.warn(`Child index ${idx} out of bounds for node ${this.id}`);
        }
    }

     // キーを適切な位置に挿入 (ソートを維持)
    insertKey(k: number): void {
        let i = this.keys.length - 1;
        // this.keys.push(0); // 一時的にサイズを増やす -> splice で対応
        while (i >= 0 && this.keys[i] > k) {
            // this.keys[i + 1] = this.keys[i]; // spliceがシフトしてくれる
            i--;
        }
        this.keys.splice(i + 1, 0, k);
    }

    // 子を適切な位置に挿入
    insertChild(idx: number, node: BTreeNode): void {
        this.children.splice(idx, 0, node);
        node.parent = this; // 親を設定
    }

    // アニメーション状態をリセット
    resetAnimationState(): void {
        this.highlight = null;
        this.operationTarget = false;
        this.statusText = null;
        this.comparingKeyIndex = null;
        this.transientValue = null; // ★リセット追加
        if (!this.isLeaf) {
            this.children.forEach(child => child.resetAnimationState());
        }
    }
}

// アニメーションステップの型定義
export interface AnimationStep {
    action: string;
    details: any;
    treeState: BTreeNode | null; // 各ステップ後のツリー状態
    description: string; // UI表示用の説明
    explanation?: string; // ★追加: アルゴリズム解説
}

// B-Tree Class
export class BTree {
    root: BTreeNode | null = null;
    t: number; // Minimum degree
    animationSteps: AnimationStep[] = []; // アニメーションステップを記録する配列

    // 各ステップの説明 (簡潔版)
    stepDescriptions: Record<string, (details: any) => string>; // Initialize in constructor
    // ★ 解説文もコンストラクタで初期化
    stepExplanations: Record<string, (details: any) => string>;

    constructor(t: number) {
        if (t < 2) {
            throw new Error("B-Tree minimum degree t must be at least 2");
        }
        this.t = t;

        // Initialize descriptions and explanations here where 'this.t' is accessible
        this.stepDescriptions = {
            // ... (copy all existing descriptions here) ...
            startSearch: (d) => `${d.value} の検索を開始します。`,
            highlightNode: (d) => `ノード [${d.keys?.join(', ') ?? '空'}] を探索中 (対象: ${d.value})。`,
            compareKey: (d) => `検索値 ${d.searchValue} とキー ${d.keyValue} (index: ${d.comparingIndex}) を比較。結果: ${d.result === 'greater' ? '大きい' : d.result === 'less' ? '小さい' : '一致'}。`,
            foundKey: (d) => `キー ${d.value} をノード index ${d.keyIndex} で発見しました。`,
            searchMiss: (d) => `${d.value} は見つかりませんでした。理由: ${d.reason === 'Node is null' ? 'ノードがnull' : d.reason === 'Reached null node (tree empty or branch end)' ? '末端ノード到達(null)' : d.reason === 'Leaf node reached, key not found' ? '葉ノード到達、キーなし' : d.reason}。`,
            traverseChild: (d) => `子ノード (index: ${d.childIndex}) へ移動します。`,
            endSearch: (d) => `${d.value} の検索終了。${d.found ? '見つかりました。' : '見つかりませんでした。'}`,
            startInsert: (d) => `${d.value} の挿入を開始します。`,
            createRoot: (d) => `ツリーが空です。値 ${d.value} でルートノードを作成します。`,
            splitRootStart: (_) => `ルートノードが満杯です。ルートの分割を開始します。`,
            splitRootEnd: (d) => `ルート分割完了。中央値 ${d.medianKey} で新しいルートを作成しました。`,
            insertNonFull: (d) => `満杯でないノード [${d.keys?.join(', ') ?? '空'}] に ${d.value} を挿入しようとしています。`,
            compareKeyForInsert: (d) => `挿入値 ${d.insertValue} と${d.comparingIndex != null ? ('キー ' + d.keyValue + ' (index: ' + d.comparingIndex + ')') : 'ノード先頭'} を比較。アクション: ${d.result === 'shift' ? '右へシフト' : d.result === 'insert after' ? '右に挿入' : d.result === 'insert at beginning' ? '先頭に挿入' : d.result === 'go left' ? '左の子へ' : d.result === 'go right' ? '右の子へ' : '左端の子へ'}。`,
            insertKeyToLeaf: (d) => `葉ノードの index ${d.index} にキー ${d.value} を挿入しました。`,
            traverseChildForInsert: (d) => `挿入のため、子ノード (index: ${d.childIndex}) へ移動します。`,
            splitStart: (d) => `子ノード (index: ${d.index}) が満杯。分割を開始します。`,
            splitFindMedian: (d) => `満杯のノードから中央のキー (${d.medianKey}) を見つけます。このキーが親ノードに昇格します。`,
            splitMoveKeysRight: (_) => `中央値より右側のキーを、新しく作成した右側の兄弟ノードに移動します。`,
            splitRemoveMedianFromChild: (d) => `元のノードから中央値を削除します。`,
            splitMoveChildren: (_) => `内部ノードの場合、分割に伴い、中央値より右側にあった子ノードへのポインタも新しい右兄弟ノードへ移動します。`,
            splitInsertNewNodeToParent: (d) => `分割してできた新しいノードを親の index ${d.index} に挿入します。`,
            splitInsertMedianToParent: (d) => `中央値 (${d.medianKey}) を親ノードの適切な位置に挿入します。これにより、左右の分割されたノードが親ノードと正しく接続されます。`,
            chooseChildAfterSplit: (d) => `分割後、${d.value} と親キー ${d.medianKey} を比較。${d.result === 'go right' ? '右' : '左'} (index: ${d.childIndex}) の子へ移動します。`,
            splitEnd: (_) => `ノード分割が完了しました。挿入処理は、昇格したキーと比較して適切な子ノードで継続されます。`,
            endInsert: (d) => `${d.value} の挿入完了。`,
            startDelete: (d) => `${d.value} の削除を開始します。`,
            deleteError: (d) => `削除エラー: ${d.reason}`, // Keep this simple
            foundKeyToDelete: (d) => `削除対象のキー ${d.value} (index: ${d.keyIndex}) を発見しました。`,
            deleteKeyFromLeaf: (d) => `葉ノードからキー ${d.value} を削除します。`,
            deleteInternalFindPredecessorStart: (_) => `内部ノード削除: 先行キー (左部分木の最大値) を探します。`,
            deleteInternalFindPredecessorEnd: (d) => `先行キー ${d.predecessorValue} を発見しました。`,
            replaceWithPredecessor: (d) => `元のキー (index: ${d.keyIndex}) を先行キー ${d.newValue} で置き換えます。`,
            deleteInternalRecurseLeft: (d) => `左の子から先行キー ${d.valueToDelete} を再帰的に削除します。`,
            deleteInternalFindSuccessorStart: (_) => `内部ノード削除: 後続キー (右部分木の最小値) を探します。`,
            deleteInternalFindSuccessorEnd: (d) => `後続キー ${d.successorValue} を発見しました。`,
            replaceWithSuccessor: (d) => `元のキー (index: ${d.keyIndex}) を後続キー ${d.newValue} で置き換えます。`,
            deleteInternalRecurseRight: (d) => `右の子から後続キー ${d.valueToDelete} を再帰的に削除します。`,
            deleteInternalMergeStart: (d) => `左右の子が最小キー数です。キー ${d.value} を中心に子をマージします。`,
            mergeChildren: (d) => `親キー ${d.parentKey} を中心に子 [${d.leftChildId.substring(0,4)}...] と [${d.rightChildId.substring(0,4)}...] をマージ中...`,
            deleteInternalMergeEnd: (d) => `マージ完了。マージ後のノードで削除を続行します。`,
            deleteInternalRecurseMerged: (d) => `マージ後のノードから ${d.valueToDelete} を再帰的に削除します。`,
            deleteKeyNotFoundInLeaf: (d) => `葉ノードにキー ${d.value} が見つかりません。削除できません。`,
            deleteTraverseChild: (d) => `現ノードにキー ${d.value} はありません。子 (index: ${d.childIndex}) へ移動します。`,
            ensureKeysStart: (d) => `子 (index: ${d.index}) のキー数が最小 (${d.currentKeys}) です。再編成が必要です (必要数: ${this.t})。`, // Use this.t
            tryBorrowFromLeft: (_) => `左の兄弟からキーを借りられないか試します。`,
            borrowFromLeft: (_) => `左の兄弟からキーを借ります。`,
            tryBorrowFromRight: (_) => `右の兄弟からキーを借りられないか試します。`,
            borrowFromRight: (_) => `右の兄弟からキーを借ります。`,
            tryMergeWithLeft: (_) => `借用不可。左の兄弟とのマージを試します。`,
            mergeWithLeft: (_) => `左の兄弟とマージします。`,
            tryMergeWithRight: (_) => `借用不可。右の兄弟とのマージを試します。`,
            mergeWithRight: (_) => `右の兄弟とマージします。`,
            ensureKeysEnd: (d) => `再編成 (${d.method === 'borrowFromLeft' ? '左から借用' : d.method === 'borrowFromRight' ? '右から借用' : d.method === 'mergeWithLeft' ? '左とマージ' : '右とマージ'}) 完了。削除を続行します。`,
            deleteDescend: (d) => `子は十分なキーを持っています。子へ降りて ${d.value} の削除を続けます。`,
            updateRootAfterDelete: (d) => `ルートが空になりました。${d.newRootId ? '唯一の子を新しいルートにします。' : 'ツリーが空になりました。'}`,
            nodeDeleted: (d) => `ノード ${d.nodeId} (${d.reason === 'Merged into left sibling' ? '左へマージ済' : d.reason === 'Empty root promotion' ? '空ルート昇格' : d.reason === 'Last key deleted' ? '最後のキー削除' : '不明'}) は削除されました。`,
            mergeEnd: (_) => `マージ完了。`,
            endDelete: (d) => `${d.value} の削除${d.success ? '完了' : '失敗'}。`,
            foundMaxKey: (d) => `先行キー ${d.value} (index: ${d.keyIndex}) を発見。`, // Placeholder, can be improved
            foundMinKey: (d) => `後続キー ${d.value} (index: ${d.keyIndex}) を発見。`, // Placeholder, can be improved
            updateNode: (d) => `ノード ${d.nodeId.substring(0,4)}... 更新。`, // Simplified
            highlightPath: (d) => `${d.value} へ向かうパスをハイライト。`,
            // ... other descriptions ...
        };

        this.stepExplanations = {
            startSearch: (_) => `B-Treeの検索はルートから開始し、値を比較しながら適切な子ノードへ降りていきます。`,
            highlightNode: (_) => `現在のノード内で、検索値と比較するキーを探します。`,
            compareKey: (d) => `B-Treeのノード内キーは昇順にソートされています。検索値(${d.searchValue})がキー(${d.keyValue})より大きい場合は右へ、小さい場合は左へ探索を進めます。一致すれば探索成功です。`,
            foundKey: (_) => `検索値がノード内のキーと一致しました。探索は成功です。`,
            searchMiss: (d) => `探索を続けましたが、${d.reason === 'Leaf node reached, key not found' ? '葉ノードに到達しても値が見つからなかった' : '探索パスの終端に達した'}ため、検索値はツリー内に存在しません。`,
            traverseChild: (_) => `現在のノードにキーが見つからなかったため、比較結果に基づいて適切な範囲の子ノードへ移動します。`,
            startInsert: (_) => `B-Treeへの挿入は、まず適切な葉ノードまで探索を行います。`,
            insertKeyToLeaf: (d) => `挿入に適した葉ノードの正しい位置 (キー ${d.value} が昇順を維持する場所) にキーを挿入しました。`,
            splitRootStart: (_) => `ルートノードが満杯 (キー数が ${2*this.t-1}) です。B-Treeのルールに従い、ノードを分割して高さを1増やします。`, // Use this.t
            splitStart: (_) => `挿入対象の子ノードが満杯 (キー数が ${2*this.t-1}) です。挿入前にこのノードを分割する必要があります。分割により、中央のキーが親ノードに昇格します。`, // Use this.t
            splitFindMedian: (d) => `満杯のノードから中央のキー (${d.medianKey}) を見つけます。このキーが親ノードに昇格します。`,
            splitMoveKeysRight: (_) => `中央値より右側のキーを、新しく作成した右側の兄弟ノードに移動します。`,
            splitMoveChildren: (_) => `内部ノードの場合、分割に伴い、中央値より右側にあった子ノードへのポインタも新しい右兄弟ノードへ移動します。`,
            splitInsertMedianToParent: (d) => `中央値 (${d.medianKey}) を親ノードの適切な位置に挿入します。これにより、左右の分割されたノードが親ノードと正しく接続されます。`,
            splitEnd: (_) => `ノード分割が完了しました。挿入処理は、昇格したキーと比較して適切な子ノードで継続されます。`,
            startDelete: (_) => `B-Treeからの削除は、まずキーを探索し、見つかった場所(葉か内部ノードか)によって処理が変わります。`,
            deleteKeyFromLeaf: (_) => `削除対象のキーが葉ノードで見つかりました。葉ノードのキー数が最小次数(${this.t-1})以上あれば、単純にキーを削除できます。`, // Use this.t
            deleteInternalFindPredecessorStart: (_) => `内部ノードのキーを削除する場合、そのまま削除すると子がぶら下がるため、代わりに葉ノードにある「先行キー」(左部分木の最大値)または「後続キー」(右部分木の最小値)を探して置き換え、その先行/後続キーを葉から削除します。まず先行キーを探します。`,
            deleteInternalFindSuccessorStart: (_) => `左部分木から先行キーを借りられない(キー数が最小)場合、右部分木の最小値である「後続キー」を探して置き換えます。`,
            replaceWithPredecessor: (d) => `見つかった先行キー (${d.newValue}) で、削除対象の内部ノードキーを置き換えました。次は、この先行キーを葉ノードから削除します。`,
            replaceWithSuccessor: (d) => `見つかった後続キー (${d.newValue}) で、削除対象の内部ノードキーを置き換えました。次は、この後続キーを葉ノードから削除します。`,
            ensureKeysStart: (d) => `削除対象キーへ向かう途中の子ノードのキー数が最小 (${this.t-1}) になっています。削除操作によってこれ以上キーが減るとB-Treeの条件を満たせなくなるため、事前に兄弟ノードからキーを借りる(Borrow)か、兄弟ノードと結合(Merge)して、キー数を${this.t}個以上にします。`, // Use this.t
            tryBorrowFromLeft: (_) => `まず、左隣の兄弟ノードからキーを借りられないか確認します。左兄弟のキー数が${this.t}個以上あれば可能です。`, // Use this.t
            borrowFromLeft: (_) => `左兄弟からキーを借ります。左兄弟の最大キーが親ノードに上がり、親ノードのキーが現在のノードに降ります。必要なら子ポインタも移動します。`,
            tryBorrowFromRight: (_) => `左兄弟から借りられない場合、右隣の兄弟ノードからキーを借りられないか確認します。右兄弟のキー数が${this.t}個以上あれば可能です。`, // Use this.t
            borrowFromRight: (_) => `右兄弟からキーを借ります。右兄弟の最小キーが親ノードに上がり、親ノードのキーが現在のノードに降ります。必要なら子ポインタも移動します。`,
            tryMergeWithLeft: (_) => `左右の兄弟どちらからもキーを借りられない場合、兄弟ノードとマージ(結合)します。まず左兄弟とのマージを試みます。`,
            mergeChildren: (d) => `ノードと兄弟ノード、そしてそれらを繋ぐ親ノードのキーを一つにまとめます。ノード '${d.leftChildId.substring(0,4)}...' と '${d.rightChildId.substring(0,4)}...' を、親キー ${d.parentKey} を含めてマージします。`,
            mergeEnd: (_) => `マージが完了しました。マージによってできた新しいノードで、削除処理を続行します。`,
            // Add explanations for other relevant actions like foundMaxKey, foundMinKey, updateNode etc.
            foundMaxKey: (_) => `左部分木の最大値(先行キー)が見つかりました。これを内部ノードの削除対象キーと置き換えます。`,
            foundMinKey: (_) => `右部分木の最小値(後続キー)が見つかりました。これを内部ノードの削除対象キーと置き換えます。`,
            updateNode: (_) => `ノードの状態(キー、子ポインタ、ハイライト等)が更新されました。`,
            highlightPath: (_) => `次の探索/挿入/削除対象が含まれる可能性のある子ノードへのパスを一時的に示しています。`,
            deleteDescend: (_) => `現在のノードの子は十分なキーを持っているため、特別な操作（借用/マージ）は不要です。そのまま子ノードへ降りて削除を続行します。`,
            deleteInternalRecurseLeft: (d) => `内部ノードのキーを先行キーで置き換えたため、次は先行キー(${d.valueToDelete})を左の子部分木から削除します。`,
            deleteInternalRecurseRight: (d) => `内部ノードのキーを後続キーで置き換えたため、次は後続キー(${d.valueToDelete})を右の子部分木から削除します。`,
            deleteInternalRecurseMerged: (d) => `子ノードのマージが完了しました。マージ後のノードに対して、元の削除対象キー(${d.valueToDelete})の削除を再帰的に行います。`,
            updateRootAfterDelete: (d) => `削除の結果、ルートノードが空になりました。${d.newRootId ? 'ルートノードの唯一の子を新しいルートに昇格させます。' : 'ツリー全体が空になりました。'}`,
            nodeDeleted: (d) => `ノード ${d.nodeId.substring(0,4)}... は${d.reason === 'Merged into left sibling' ? '左の兄弟とマージされた' : d.reason === 'Empty root promotion' ? '空になり子が昇格した' : d.reason === 'Last key deleted' ? '最後のキーが削除され空になった' : '理由不明で'}ため、削除されました。`,
            endSearch: (d) => `キー ${d.value} の検索が終了しました。${d.found ? 'キーは見つかりました。' : 'キーは見つかりませんでした。'}`,
            endInsert: (d) => `キー ${d.value} の挿入が完了しました。`,
            endDelete: (d) => `キー ${d.value} の削除が完了しました。${d.success ? '' : '失敗しました。'}`,

        };
    }

    // アニメーションステップを追加するヘルパー
    addStep(action: string, details: any) {
        const clonedTree = this.cloneTree();
        const description = this.stepDescriptions[action]?.(details) ?? `Executing: ${action}`;
        // ★ Get explanation using 'this.stepExplanations' (no need to pass 't')
        const explanation = this.stepExplanations[action]?.(details);
        this.animationSteps.push({ action, details, treeState: clonedTree, description, explanation });
    }

    // アニメーションステップをクリア
    clearSteps() {
        this.animationSteps = [];
        this.root?.resetAnimationState(); // 既存のハイライト等もリセット
    }

    // 現在のツリー状態のディープコピーを生成 (可視化のため)
    cloneTree(): BTreeNode | null {
        if (!this.root) return null;

        const cloneNode = (node: BTreeNode): BTreeNode => {
            const newNode = new BTreeNode(node.t, node.isLeaf);
            newNode.id = node.id; // IDは維持する
            newNode.keys = [...node.keys];
            newNode.highlight = node.highlight;
            newNode.operationTarget = node.operationTarget;
            newNode.statusText = node.statusText;
            newNode.comparingKeyIndex = node.comparingKeyIndex;
            newNode.transientValue = node.transientValue ? { ...node.transientValue } : null; // ★コピー追加
            // 親はコピーしない

            if (!node.isLeaf) {
                newNode.children = node.children.map(child => cloneNode(child));
                // コピーした子に新しい親を設定 (可視化には不要だが、内部ロジックで使うなら必要)
                // newNode.children.forEach(child => child.parent = newNode);
            }
            return newNode;
        };

        return cloneNode(this.root);
    }

    // アニメーションのための遅延関数 (外部から注入可能にしてもよい)
    private async delay(ms: number): Promise<void> {
        // アニメーション速度調整のため、ここでは遅延を短くする/なくす
        // UI側でステップごとに表示を制御する方が柔軟
        // return new Promise(resolve => setTimeout(resolve, ms));
        await Promise.resolve(); // 非同期処理のティックを進めるだけ
    }

    // --- Search --- (アニメーション付き)
    async search(k: number): Promise<{ node: BTreeNode; index: number } | null> {
        this.clearSteps();
        this.addStep('startSearch', { value: k });
        const result = await this._searchRecursive(this.root, k);
        // ★ Reset state BEFORE adding the end step
        this.root?.resetAnimationState();
        this.addStep('endSearch', { value: k, found: !!result });
        return result;
    }

    private async _searchRecursive(node: BTreeNode | null, k: number): Promise<{ node: BTreeNode; index: number } | null> {
        if (!node) {
            this.addStep('searchMiss', { value: k, reason: 'Reached null node (tree empty or branch end)' });
            return null;
        }

        node.highlight = 'search';
        this.addStep('highlightNode', { nodeId: node.id, keys: [...node.keys], value: k });
        await this.delay(50);

        let i = 0;
        while (i < node.keys.length && k > node.keys[i]) {
            node.comparingKeyIndex = i;
            node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
            this.addStep('compareKey', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], searchValue: k, result: 'greater' });
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // 状態記録
            await this.delay(50); // ★遅延を追加して表示時間確保
            node.transientValue = null; // ★一時表示値を解除
            node.comparingKeyIndex = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
            await this.delay(30);
            i++;
        }
        node.comparingKeyIndex = null;
        node.transientValue = null; // ★ループ後も解除
        this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });

        if (i < node.keys.length && k === node.keys[i]) {
            node.comparingKeyIndex = i;
            node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
            node.highlight = 'found';
            node.operationTarget = true;
            this.addStep('compareKey', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], searchValue: k, result: 'equal' });
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
            this.addStep('foundKey', { nodeId: node.id, keyIndex: i, value: k });
            await this.delay(70); // ★遅延を少し長く
            node.comparingKeyIndex = null;
            node.transientValue = null; // ★解除
            return { node: node, index: i };
        }

        if (i < node.keys.length) {
            node.comparingKeyIndex = i;
            node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
            this.addStep('compareKey', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], searchValue: k, result: 'less' });
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
            await this.delay(50);
            node.comparingKeyIndex = null;
            node.transientValue = null; // ★解除
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
            await this.delay(30);
        }

        if (node.isLeaf) {
            node.highlight = 'search'; // Miss の場合も探索対象だったことを示す
            this.addStep('searchMiss', { value: k, reason: 'Leaf node reached, key not found' });
            await this.delay(50);
            node.highlight = null; // ★ Miss後すぐに解除
            node.comparingKeyIndex = null;
            node.transientValue = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
            return null;
        }

        // ★ Traverse Child 前に現在のノードのハイライト解除
        node.highlight = null;
        node.comparingKeyIndex = null;
        node.transientValue = null;
        this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
        await this.delay(10); // 短い遅延

        this.addStep('traverseChild', { nodeId: node.id, childIndex: i });
        const childToTraverse = node.children[i];
        childToTraverse.highlight = 'path';
        this.addStep('highlightPath', { parentId: node.id, childId: childToTraverse.id, value: k })
        await this.delay(30);
        // childToTraverse.highlight = null; // パスハイライトは再帰先で解除される

        const result = await this._searchRecursive(childToTraverse, k);
        // 再帰から戻ってきたらパスハイライトを消す（ただし見つかった場合は残すことが多い）
        if (!result) {
            childToTraverse.highlight = null;
        }
        return result;
    }

    // --- Insertion --- (アニメーション付き)
    async insert(k: number): Promise<void> {
        this.clearSteps();
        this.addStep('startInsert', { value: k });

        // もしルートが null なら、新しいルートを作成
        if (!this.root) {
            this.root = new BTreeNode(this.t, true);
            this.root.insertKey(k); // Use helper
            this.root.operationTarget = true; // 新規フラグの代わり
            this.addStep('createRoot', { nodeId: this.root.id, value: k });
            await this.delay(50);
            this.root.operationTarget = false;
            this.addStep('updateNode', { nodeId: this.root.id, keys: [...this.root.keys], childrenIds: [] }); // Pass childrenIds=[] for leaf
            // ★ Reset state BEFORE adding the end step for empty tree case
            this.root?.resetAnimationState();
            this.addStep('endInsert', { value: k });
            return;
        }

        // ルートが満杯の場合、分割
        if (this.root.isFull()) {
            const oldRoot = this.root;
            const newRoot = new BTreeNode(this.t, false);
            this.root = newRoot;
            this.root.highlight = 'split'; // 分割中を示す
            this.addStep('splitRootStart', { oldRootId: oldRoot.id, newRootId: newRoot.id });
            await this.delay(50);

            newRoot.insertChild(0, oldRoot); // insertChild を使う
            await this.splitChild(newRoot, 0); // newRoot の 0番目の子 (oldRoot) を分割

            this.root.highlight = null;
            this.addStep('splitRootEnd', { newRootId: newRoot.id, oldRootId: oldRoot.id, medianKey: newRoot.keys[0] });

            // 分割後、新しいルートに対して挿入処理を続ける
            await this._insertNonFull(newRoot, k);
        }
        else {
            await this._insertNonFull(this.root, k);
        }
        // ★ Reset state BEFORE adding the end step
        this.root?.resetAnimationState();
        this.addStep('endInsert', { value: k });
    }

    // 子ノードを分割する (親ノード parent の i 番目の子 nodeToSplit を分割)
    private async splitChild(parent: BTreeNode, i: number): Promise<void> {
        const nodeToSplit = parent.children[i];
        parent.highlight = 'split';
        nodeToSplit.highlight = 'split';
        this.addStep('splitStart', { parentId: parent.id, childId: nodeToSplit.id, index: i });

        const newNode = new BTreeNode(nodeToSplit.t, nodeToSplit.isLeaf);
        newNode.parent = parent; // 新しいノードの親を設定
        newNode.highlight = 'split'; // 新規ノードもハイライト

        // nodeToSplit の中央のキーを取得
        const medianIndex = this.t - 1;
        const medianKey = nodeToSplit.keys[medianIndex];
        nodeToSplit.operationTarget = true; // 中央値をマーク
        this.addStep('splitFindMedian', { nodeId: nodeToSplit.id, medianIndex: medianIndex, medianKey: medianKey });
        await this.delay(50);
        nodeToSplit.operationTarget = false;

        // 新しいノードに nodeToSplit の後半のキー (t-1個) を移動
        newNode.keys = nodeToSplit.keys.splice(medianIndex + 1); // 中央値の右側
        newNode.operationTarget = true; // 移動されたキーをマーク
        this.addStep('splitMoveKeysRight', { fromId: nodeToSplit.id, toId: newNode.id, keys: [...newNode.keys] });
        this.addStep('updateNode', { nodeId: nodeToSplit.id, keys: [...nodeToSplit.keys], childrenIds: nodeToSplit.isLeaf ? [] : nodeToSplit.children.map(c => c.id) });
        await this.delay(50);
        newNode.operationTarget = false;
        this.addStep('updateNode', { nodeId: newNode.id, keys: [...newNode.keys], childrenIds: newNode.isLeaf ? [] : newNode.children.map(c => c.id) });

        // nodeToSplit から中央値のキーを削除 (後で親に移動)
        nodeToSplit.removeKey(medianKey); // removeKey を使う
        this.addStep('splitRemoveMedianFromChild', { nodeId: nodeToSplit.id, keys: [...nodeToSplit.keys], childrenIds: nodeToSplit.isLeaf ? [] : nodeToSplit.children.map(c => c.id) });
        await this.delay(50);

        // nodeToSplit が内部ノードの場合、後半の子 (t個) を新しいノードに移動
        if (!nodeToSplit.isLeaf) {
            newNode.children = nodeToSplit.children.splice(this.t); // 後半の子
            newNode.children.forEach(child => child.parent = newNode); // 新しい親を設定
            newNode.operationTarget = true; // 移動された子をマーク
            this.addStep('splitMoveChildren', { fromId: nodeToSplit.id, toId: newNode.id, numChildren: newNode.children.length });
            this.addStep('updateNode', { nodeId: nodeToSplit.id, keys: [...nodeToSplit.keys], childrenIds: nodeToSplit.children.map(c => c.id) });
            await this.delay(50);
            newNode.operationTarget = false;
             this.addStep('updateNode', { nodeId: newNode.id, keys: [...newNode.keys], childrenIds: newNode.children.map(c => c.id) });
        }

        // 新しいノード (newNode) を親 (parent) の子リストに挿入 (元の nodeToSplit の右隣)
        parent.insertChild(i + 1, newNode);
        this.addStep('splitInsertNewNodeToParent', { parentId: parent.id, newNodeId: newNode.id, index: i + 1 });
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id) });
        await this.delay(50);

        // 中央値のキー (medianKey) を親 (parent) に挿入
        parent.insertKey(medianKey);
        parent.operationTarget = true; // 上昇したキーをマーク
        this.addStep('splitInsertMedianToParent', { parentId: parent.id, medianKey: medianKey, index: i });
        await this.delay(50);
        parent.operationTarget = false;
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id) });

        // ハイライト解除
        parent.highlight = null;
        nodeToSplit.highlight = null;
        newNode.highlight = null;
        this.addStep('splitEnd', { parentId: parent.id, originalChildId: nodeToSplit.id, newChildId: newNode.id });
    }

    // まだ満杯でないノードにキーを挿入する
    private async _insertNonFull(node: BTreeNode, k: number): Promise<void> {
        node.highlight = 'insert';
        this.addStep('insertNonFull', { nodeId: node.id, keys: [...node.keys], value: k });
        await this.delay(50);

        // 葉ノードの場合
        if (node.isLeaf) {
            let i = node.keys.length - 1;
            // 正しい位置を見つける
            while (i >= 0 && k < node.keys[i]) {
                node.comparingKeyIndex = i;
                node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
                this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], insertValue: k, result: 'shift' });
                this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] }); // ★記録
                await this.delay(50);
                node.transientValue = null; // ★解除
                node.comparingKeyIndex = null;
                this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
                i--;
            }
             if (i >= 0) {
                node.comparingKeyIndex = i;
                node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
                this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], insertValue: k, result: 'insert after' });
                this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] }); // ★記録
                await this.delay(50);
                node.transientValue = null; // ★解除
                this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
            } else {
                 node.transientValue = { value: k, keyIndex: -1 }; // ★先頭挿入の場合 (-1 で示す)
                 this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: null, insertValue: k, result: 'insert at beginning' });
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] }); // ★記録
                 await this.delay(50);
            }

            // キーを挿入
            node.insertKey(k);
            node.operationTarget = true; // 挿入されたキーをマーク
            this.addStep('insertKeyToLeaf', { nodeId: node.id, value: k, index: i + 1, keys: [...node.keys] });
            await this.delay(50);
            node.operationTarget = false;
            node.highlight = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
            // this.addStep('unhighlightNode', { nodeId: node.id });

        }
        // 内部ノードの場合
        else {
            let i = node.keys.length - 1;
            // 正しい子ノードを見つける
            while (i >= 0 && k < node.keys[i]) {
                 node.comparingKeyIndex = i;
                 node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
                 this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], insertValue: k, result: 'go left' });
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // ★記録
                 await this.delay(50);
                 node.transientValue = null; // ★解除
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // ★記録
                i--;
            }
             if (i >= 0) {
                 node.comparingKeyIndex = i;
                 node.transientValue = { value: k, keyIndex: i }; // ★一時表示値をセット
                 this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: i, keyValue: node.keys[i], insertValue: k, result: 'go right' });
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // ★記録
                 await this.delay(50);
                 node.transientValue = null; // ★解除
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // ★記録
            } else {
                 node.transientValue = { value: k, keyIndex: -1 }; // ★左端へ行く場合
                 this.addStep('compareKeyForInsert', { nodeId: node.id, comparingIndex: null, insertValue: k, result: 'go leftmost' });
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) }); // ★記録
                 await this.delay(50);
            }
            i++; // 正しい子のインデックス

            node.highlight = null; // 現在ノードのハイライト解除
            const childToTraverse = node.children[i];
            childToTraverse.highlight = 'path'; // 辿るパスを示す
            this.addStep('traverseChildForInsert', { nodeId: node.id, childIndex: i, childId: childToTraverse.id });
            // this.addStep('unhighlightNode', { nodeId: node.id });
            await this.delay(50);
            childToTraverse.highlight = null; // パスハイライト解除 (次のノードがハイライトされるため)

            // 降りる子ノードが満杯の場合、分割する
            if (node.children[i].isFull()) {
                await this.splitChild(node, i);
                // 分割後、どちらの子ノードに降りるか再決定
                if (k > node.keys[i]) {
                    this.addStep('chooseChildAfterSplit', { parentId: node.id, value: k, medianKey: node.keys[i], result: 'go right', childIndex: i + 1 });
                    i++;
                } else {
                    this.addStep('chooseChildAfterSplit', { parentId: node.id, value: k, medianKey: node.keys[i], result: 'go left', childIndex: i });
                }
                await this.delay(50);
            }
            // 再帰的に挿入
            await this._insertNonFull(node.children[i], k);
        }
    }

    // --- Deletion --- (アニメーション付き)
    async delete(k: number): Promise<void> {
        this.clearSteps();
        this.addStep('startDelete', { value: k });
        if (!this.root) {
            this.addStep('deleteError', { value: k, reason: 'Tree is empty' });
            console.warn("Deletion failed: Tree is empty.");
            // No need to reset state here as tree is empty
            this.addStep('endDelete', { value: k, success: false });
            return;
        }

        // 削除実行前にキーが存在するか確認 (オプションだが親切)
        const keyExists = await this.keyExistsInTree(this.root, k);
        if (!keyExists) {
             this.addStep('deleteError', { value: k, reason: 'Key not found in tree' });
             console.warn(`Deletion failed: Key ${k} not found in the tree.`);
              // 検索アニメーションを実行して「見つからない」ことを示す
             await this.search(k); // search は内部で clearSteps するので、アニメーションステップを結合する必要がある
             const searchSteps = this.animationSteps;
             this.clearSteps(); // searchの結果をクリア
             this.addStep('startDelete', { value: k }); // 削除開始を再追加
             this.addStep('deleteError', { value: k, reason: 'Key not found in tree' });
             this.animationSteps.push(...searchSteps.slice(1)); // search の開始以外を追加
             // ★ Reset state BEFORE adding the end step for key not found case
             this.root?.resetAnimationState(); // Search might have left highlights
             this.addStep('endDelete', { value: k, success: false });
             return;
        }
        // --- キー存在確認ここまで ---

        let deleteSuccess = false;
        try {
            console.log(`[DEBUG] Calling _deleteRecursiveWrapper for key ${k}`);
            // Add explicit null check before calling wrapper
            if (!this.root) {
                 console.error(`[DEBUG] Root became null unexpectedly before calling _deleteRecursiveWrapper for key ${k}`);
                 this.addStep('deleteError', { value: k, reason: 'Root became null unexpectedly'});
                 throw new Error('Root became null unexpectedly'); // Throw error to be caught below
            }
            await this._deleteRecursiveWrapper(this.root, k);
            deleteSuccess = true; // Assume success if no exception
        } catch (error) {
            // Errors are handled and added as steps within the wrapper or recursive calls
            console.error(`[DEBUG] Error caught directly in delete method: ${error}`);
            // Ensure deleteSuccess is false if an error occurred here
            deleteSuccess = false;
            // We might not need to add another step if the wrapper already did
            // Check if the last step is already an error
            const lastStep = this.animationSteps[this.animationSteps.length - 1];
            if (!lastStep || lastStep.action !== 'deleteError') {
                 this.addStep('deleteError', { value: k, reason: `Operation failed: ${error instanceof Error ? error.message : String(error)}` });
            }
        }

        // --- Root Update Logic --- (Added detailed logging)
        console.log(`[DEBUG] After recursive delete. Current root: ${this.root?.id ?? 'null'}, Keys: [${this.root?.keys?.join(', ') ?? ''}]`);
        let rootNodeForFinalStep = this.root; // Keep track of the final root

        // Case 1: Root is not leaf and has no keys left -> Promote its only child
        if (this.root && this.root.keys.length === 0 && !this.root.isLeaf) {
             console.log(`[DEBUG] Root ${this.root.id} has no keys and is not leaf. Checking children count: ${this.root.children.length}`);
             this.addStep('updateRootAfterDelete', { oldRootId: this.root.id, newRootId: this.root.children[0]?.id ?? null });
             await this.delay(50);
            if (this.root.children.length === 1) { // Standard case after merge reduces parent key
                const oldRoot = this.root;
                this.root = this.root.children[0];
                this.root.parent = null; // New root has no parent
                rootNodeForFinalStep = this.root; // Update the node for the final step
                oldRoot.operationTarget = true; // Mark old root
                this.addStep('nodeDeleted', { nodeId: oldRoot.id, reason: 'Empty root promotion' });
                console.log(`[DEBUG] Root promoted. New root: ${this.root.id}, Keys: [${this.root.keys.join(', ')}]`);
                 await this.delay(50);
            } else if (this.root.children.length === 0) {
                 // This case implies the tree structure was invalid or became invalid.
                 console.warn(`[DEBUG] Root ${this.root.id} became keyless internal node with no children. Setting root to null.`);
                 const oldRootId = this.root.id; // Store ID before nulling
                 this.root = null;
                 rootNodeForFinalStep = null;
                 this.addStep('nodeDeleted', { nodeId: oldRootId, reason: 'Invalid empty internal root removed' }); // Use stored ID
            } else {
                 // Root had 0 keys but multiple children? This shouldn't happen.
                 console.warn(`[DEBUG] Root ${this.root.id} has 0 keys but ${this.root.children.length} children. Tree might be inconsistent. Promoting first child.`);
                 const oldRoot = this.root;
                 this.root = this.root.children[0];
                 this.root.parent = null;
                 rootNodeForFinalStep = this.root;
                 oldRoot.operationTarget = true;
                 this.addStep('nodeDeleted', { nodeId: oldRoot.id, reason: 'Empty root promotion (multiple children case)' });
                 await this.delay(50);
            }
        // Case 2: Root is leaf and has no keys left -> Tree becomes empty
        } else if (this.root && this.root.keys.length === 0 && this.root.isLeaf) {
             console.log(`[DEBUG] Root ${this.root.id} has no keys and is leaf. Tree is now empty.`);
             this.addStep('updateRootAfterDelete', { oldRootId: this.root.id, newRootId: null });
             this.root.operationTarget = true;
             const oldRootId = this.root.id; // Store ID before nulling
             this.addStep('nodeDeleted', { nodeId: oldRootId, reason: 'Last key deleted' }); // Use stored ID
             await this.delay(50);
             this.root = null; // Tree becomes empty
             rootNodeForFinalStep = null;
        }

        console.log(`[DEBUG] Final root state before endDelete step: ${rootNodeForFinalStep?.id ?? 'null'}`);
        // ★ Reset state BEFORE adding the end step (on the potentially new root)
        // Add explicit null check for resetAnimationState call
        if (rootNodeForFinalStep) {
             rootNodeForFinalStep.resetAnimationState();
        }
        // Use the tracked final root for the last step's state
        // cloneSpecificNode already handles null input
        const finalTreeStateForStep: BTreeNode | null = this.cloneSpecificNode(rootNodeForFinalStep);
        this.addStep('endDelete', { value: k, success: deleteSuccess });
        // Manually overwrite the last step's treeState to ensure correctness
        if (this.animationSteps.length > 0) {
             this.animationSteps[this.animationSteps.length - 1].treeState = finalTreeStateForStep;
        }

        console.log(`[DEBUG] Delete method finished for key ${k}`);
    }

    // Need a way to clone a specific node without cloning the whole tree via this.root
    private cloneSpecificNode(node: BTreeNode | null): BTreeNode | null {
         if (!node) return null;
          const cloneNode = (n: BTreeNode): BTreeNode => {
            const newNode = new BTreeNode(n.t, n.isLeaf);
            newNode.id = n.id;
            newNode.keys = [...n.keys];
            newNode.highlight = n.highlight;
            newNode.operationTarget = n.operationTarget;
            newNode.statusText = n.statusText;
            newNode.comparingKeyIndex = n.comparingKeyIndex;
            newNode.transientValue = n.transientValue ? { ...n.transientValue } : null;

            if (!n.isLeaf) {
                newNode.children = n.children.map(child => cloneNode(child));
            }
            return newNode;
        };
         return cloneNode(node);
    }

    // _deleteRecursive のラッパー。削除成否を boolean で返すようにする。
    private async _deleteRecursiveWrapper(node: BTreeNode, k: number): Promise<boolean> {
        try {
            await this._deleteRecursive(node, k);
            return true; // 例外が出なければ成功とみなす (ensure~ が false を返すケースを要検討)
        } catch (error) {
            if (error instanceof Error && error.message === 'KEY_NOT_FOUND_FOR_DELETION') {
                 this.addStep('deleteError', { value: k, reason: 'Key vanished during rebalancing (should not happen in standard delete)' });
                console.error("Key to delete was not found where expected, possibly due to concurrent modification or logic error.");
                return false;
            } else {
                 this.addStep('deleteError', { value: k, reason: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` });
                console.error("Unexpected error during deletion:", error);
                return false;
            }
        }
    }

    // --- Deletion recursive core logic ---
    private async _deleteRecursive(node: BTreeNode, k: number): Promise<void> {
        console.log(`[DEBUG] _deleteRecursive called for node ${node.id} (keys: [${node.keys.join(', ')}]) with key ${k}`); // ★ DEBUG LOG
        node.highlight = 'delete';
        this.addStep('highlightNode', { nodeId: node.id, keys: [...node.keys], value: k, reason: 'Searching node for deletion' });
        await this.delay(50);

        const idx = node.findKey(k);

        // Case 1: キー k が現在のノード node に存在する
        if (idx < node.keys.length && node.keys[idx] === k) {
            console.log(`[DEBUG] Key ${k} found in node ${node.id} at index ${idx}`); // ★ DEBUG LOG
            node.operationTarget = true; // 削除対象キーをマーク
            this.addStep('foundKeyToDelete', { nodeId: node.id, keyIndex: idx, value: k });
            await this.delay(50);

            if (node.isLeaf) {
                console.log(`[DEBUG] Deleting key ${k} from leaf node ${node.id}`); // ★ DEBUG LOG
                // Case 1a: node が葉ノード -> 単純に削除
                this.addStep('deleteKeyFromLeaf', { nodeId: node.id, keyIndex: idx, value: k });
                await this.delay(50);
                node.removeKey(k);
                console.log(`[DEBUG] Keys after removeKey in leaf ${node.id}: [${node.keys.join(', ')}]`); // ★ DEBUG LOG
                node.operationTarget = false; // マーク解除
                node.highlight = null;
                this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
                console.log(`[DEBUG] Leaf deletion finished for key ${k} in node ${node.id}`); // ★ DEBUG LOG
            } else {
                 console.log(`[DEBUG] Deleting key ${k} from internal node ${node.id}`); // ★ DEBUG LOG
                // Case 1b: node が内部ノード
                const leftChild = node.children[idx];
                const rightChild = node.children[idx + 1];
                node.operationTarget = false; // キー自体のマークは一旦解除

                // Case 1b-i: 左の子 leftChild が十分なキーを持つ (t 個以上)
                if (leftChild.keys.length >= this.t) {
                     console.log(`[DEBUG] Internal delete case 1b-i (borrow from left) for key ${k} in node ${node.id}`); // ★ DEBUG LOG
                    this.addStep('deleteInternalFindPredecessorStart', { nodeId: node.id, leftChildId: leftChild.id });
                    const predecessor = await this.findMaxKeyRecursive(leftChild);
                    this.addStep('deleteInternalFindPredecessorEnd', { predecessorValue: predecessor });
                    await this.delay(50);

                    // k を先行キーで置き換え
                    node.keys[idx] = predecessor;
                    node.operationTarget = true; // 置き換えたキーをマーク
                    this.addStep('replaceWithPredecessor', { nodeId: node.id, keyIndex: idx, newValue: predecessor });
                    await this.delay(50);
                    node.operationTarget = false;
                    this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });

                    // 左の子から先行キーを再帰的に削除
                    node.highlight = null;
                    this.addStep('deleteInternalRecurseLeft', { nodeId: node.id, leftChildId: leftChild.id, valueToDelete: predecessor });
                    await this._deleteRecursive(leftChild, predecessor);
                }
                // Case 1b-ii: 右の子 rightChild が十分なキーを持つ (t 個以上)
                else if (rightChild.keys.length >= this.t) {
                     console.log(`[DEBUG] Internal delete case 1b-ii (borrow from right) for key ${k} in node ${node.id}`); // ★ DEBUG LOG
                    this.addStep('deleteInternalFindSuccessorStart', { nodeId: node.id, rightChildId: rightChild.id });
                    const successor = await this.findMinKeyRecursive(rightChild);
                    this.addStep('deleteInternalFindSuccessorEnd', { successorValue: successor });
                    await this.delay(50);

                    // k を後続キーで置き換え
                    node.keys[idx] = successor;
                    node.operationTarget = true;
                    this.addStep('replaceWithSuccessor', { nodeId: node.id, keyIndex: idx, newValue: successor });
                    await this.delay(50);
                    node.operationTarget = false;
                    this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });

                    // 右の子から後続キーを再帰的に削除
                    node.highlight = null;
                    this.addStep('deleteInternalRecurseRight', { nodeId: node.id, rightChildId: rightChild.id, valueToDelete: successor });
                    await this._deleteRecursive(rightChild, successor);
                }
                // Case 1b-iii: 左右の子がどちらも最低限のキー (t-1 個) しか持たない -> マージ
                else {
                     console.log(`[DEBUG] Internal delete case 1b-iii (merge children) for key ${k} in node ${node.id}`); // ★ DEBUG LOG
                    this.addStep('deleteInternalMergeStart', { nodeId: node.id, leftChildId: leftChild.id, rightChildId: rightChild.id, keyIndex: idx, value: k });
                    // mergeChildren を呼び出す
                    const mergedNode = await this.mergeChildren(node, idx); // k が含まれていたキーはマージ時に降りる
                    this.addStep('deleteInternalMergeEnd', { parentId: node.id, mergedNodeId: mergedNode.id });
                    // マージ後のノードから k を再帰的に削除する
                    node.highlight = null;
                    mergedNode.highlight = 'delete'; // マージ後のノードをハイライト
                    this.addStep('deleteInternalRecurseMerged', { parentId: node.id, mergedNodeId: mergedNode.id, valueToDelete: k });
                    await this._deleteRecursive(mergedNode, k);
                }
            }
        }
        // Case 2: キー k が現在のノード node に存在しない
        else {
             console.log(`[DEBUG] Key ${k} not found in node ${node.id}`); // ★ DEBUG LOG
             // Case 2a: 葉ノードに到達したがキーがない -> 削除失敗 (または既にない)
            if (node.isLeaf) {
                 console.log(`[DEBUG] Key ${k} not found in leaf node ${node.id}, throwing error.`); // ★ DEBUG LOG
                node.highlight = null; // ★ Not found後すぐに解除
                 node.comparingKeyIndex = null;
                 node.transientValue = null;
                 this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] });
                throw new Error('KEY_NOT_FOUND_FOR_DELETION');
            }

            // Case 2b: 内部ノードで、キー k が存在する可能性のある子ノード targetChild に降りる
            const targetChildIndex = idx;
            let childToDescend = node.children[targetChildIndex];
            console.log(`[DEBUG] Key ${k} not found in node ${node.id}, descending to child index ${targetChildIndex} (id: ${childToDescend.id})`); // ★ DEBUG LOG

            // ★ Traverse Child 前に現在のノードのハイライト解除
            node.highlight = null;
            node.comparingKeyIndex = null;
            node.transientValue = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: node.children.map(c => c.id) });
            await this.delay(10);

            childToDescend.highlight = 'path';
            this.addStep('deleteTraverseChild', { nodeId: node.id, childIndex: targetChildIndex, childId: childToDescend.id, value: k });
            await this.delay(50);
            // childToDescend.highlight = null; // Path highlight removed by ensureChild or recursive call

            console.log(`[DEBUG] Checking rebalance for child ${childToDescend.id}: keys.length=${childToDescend.keys.length}, t=${this.t}`); // ★ Log added previously
            if (childToDescend.keys.length < this.t) {
                console.log(`[DEBUG] Child index ${targetChildIndex} (id: ${childToDescend.id}) needs rebalancing, calling ensureChildHasEnoughKeys`); // ★ DEBUG LOG
                // Ensure child has enough keys (this handles recursion)
                await this.ensureChildHasEnoughKeys(node, targetChildIndex, k);
                // If ensureChildHasEnoughKeys was called, it handles the recursive call,
                // so we should not proceed further in this iteration.
            } else {
                // Only descend directly if the child DID NOT need rebalancing.
                console.log(`[DEBUG] Descending directly to child ${childToDescend.id}`); // ★ DEBUG LOG
                // Descend directly
                 this.addStep('deleteDescend', { parentId: node.id, childId: childToDescend.id, value: k});
                 await this._deleteRecursive(childToDescend, k);
                 console.log(`[DEBUG] Returned from recursive call for key ${k} in child ${childToDescend.id}`); // ★ DEBUG LOG
            }
            console.log(`[DEBUG] Finished descending logic for key ${k} in node ${node.id}`); // ★ DEBUG LOG
        }
         console.log(`[DEBUG] _deleteRecursive finishing for node ${node.id} with key ${k}`); // ★ DEBUG LOG
    }

    // --- Helper methods for Deletion (Re-add findMax/Min) ---
    private async findMaxKeyRecursive(node: BTreeNode): Promise<number> {
        node.highlight = 'path';
        this.addStep('highlightNode', { nodeId: node.id, keys: [...node.keys], reason: 'Finding predecessor (max key)' });
        await this.delay(50);
        if (node.isLeaf) {
            node.highlight = 'found';
            const maxKey = node.keys[node.keys.length - 1];
            node.operationTarget = true;
            this.addStep('foundMaxKey', { nodeId: node.id, keyIndex: node.keys.length - 1, value: maxKey });
            await this.delay(50);
            node.highlight = null; // 見つけたら解除
            node.operationTarget = false;
            node.comparingKeyIndex = null; // Ensure cleared
            node.transientValue = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] }); // Record cleared state
            return maxKey;
        } else {
             node.highlight = null;
             const rightmostChildIndex = node.children.length - 1;
             const rightmostChild = node.children[rightmostChildIndex];
             this.addStep('traverseChild', { nodeId: node.id, childIndex: rightmostChildIndex, childId: rightmostChild.id, reason: 'Going right to find max' });
            const result = await this.findMaxKeyRecursive(rightmostChild);
            return result;
        }
    }

    private async findMinKeyRecursive(node: BTreeNode): Promise<number> {
         node.highlight = 'path';
         this.addStep('highlightNode', { nodeId: node.id, keys: [...node.keys], reason: 'Finding successor (min key)' });
         await this.delay(50);
        if (node.isLeaf) {
             node.highlight = 'found';
             const minKey = node.keys[0];
             node.operationTarget = true;
            this.addStep('foundMinKey', { nodeId: node.id, keyIndex: 0, value: minKey });
            await this.delay(50);
             node.highlight = null;
             node.operationTarget = false;
            node.comparingKeyIndex = null; // Ensure cleared
            node.transientValue = null;
            this.addStep('updateNode', { nodeId: node.id, keys: [...node.keys], childrenIds: [] }); // Record cleared state
            return minKey;
        } else {
             node.highlight = null;
             const leftmostChild = node.children[0];
             this.addStep('traverseChild', { nodeId: node.id, childIndex: 0, childId: leftmostChild.id, reason: 'Going left to find min' });
            const result = await this.findMinKeyRecursive(leftmostChild);
            return result;
        }
    }

    // Optional: Helper to check if a key exists before attempting deletion
    private async keyExistsInTree(node: BTreeNode | null, k: number): Promise<boolean> {
         // This version does not add animation steps
         if (!node) return false;
         let i = 0;
        while (i < node.keys.length && k > node.keys[i]) {
            i++;
        }
        if (i < node.keys.length && k === node.keys[i]) {
            return true;
        }
        if (node.isLeaf) {
            return false;
        }
        // Ensure children array exists and index is valid before recursing
        if (node.children && i < node.children.length) {
             return await this.keyExistsInTree(node.children[i], k);
        } else {
            // Should not happen in a valid B-Tree unless node is a leaf
            return false;
        }
    }

    // --- Borrow/Merge Implementation (Ensure this section exists correctly) ---
    private async ensureChildHasEnoughKeys(parent: BTreeNode, idx: number, k: number): Promise<void> {
        const child = parent.children[idx];
        this.addStep('ensureKeysStart', { parentId: parent.id, index: idx, childId: child.id, currentKeys: child.keys.length, keysNeeded: this.t });
        await this.delay(50);

        let rebalancedNode = child; // Assume child is where recursion continues unless merged
        let methodUsed = '';

        // Try borrowing from the left sibling
        if (idx > 0 && parent.children[idx - 1].keys.length >= this.t) {
            this.addStep('tryBorrowFromLeft', { parentId: parent.id, childIndex: idx, leftSiblingId: parent.children[idx-1].id });
            await this.borrowFromLeft(parent, idx);
            methodUsed = 'borrowFromLeft';
        }
        // Try borrowing from the right sibling
        else if (idx < parent.children.length - 1 && parent.children[idx + 1].keys.length >= this.t) {
            this.addStep('tryBorrowFromRight', { parentId: parent.id, childIndex: idx, rightSiblingId: parent.children[idx+1].id });
            await this.borrowFromRight(parent, idx);
            methodUsed = 'borrowFromRight';
        }
        // Merge with the left sibling
        else if (idx > 0) {
            this.addStep('tryMergeWithLeft', { parentId: parent.id, childIndex: idx, leftSiblingId: parent.children[idx-1].id });
            rebalancedNode = await this.mergeChildren(parent, idx - 1); // Merge left, returns the merged node
            methodUsed = 'mergeWithLeft';
        }
        // Merge with the right sibling
        else {
            this.addStep('tryMergeWithRight', { parentId: parent.id, childIndex: idx, rightSiblingId: parent.children[idx+1].id });
            rebalancedNode = await this.mergeChildren(parent, idx); // Merge right, returns the merged node (which was originally the left child)
            methodUsed = 'mergeWithRight';
        }

        this.addStep('ensureKeysEnd', { parentId: parent.id, index: idx, method: methodUsed });
        await this.delay(50);

        // After rebalancing, continue the deletion process on the appropriate node
        // The key 'k' might now be in the rebalancedNode (if merged)
        // or still needs to be deleted from the original child (if borrowed)
        // _deleteRecursive needs to handle finding 'k' again in the target node.
        rebalancedNode.highlight = 'delete'; // Highlight the node where deletion continues
        this.addStep('deleteDescend', { parentId: parent.id, childId: rebalancedNode.id, value: k, reason: `After ${methodUsed}` });
        await this._deleteRecursive(rebalancedNode, k);
    }

    private async borrowFromLeft(parent: BTreeNode, idx: number): Promise<void> {
        const child = parent.children[idx];
        const leftSibling = parent.children[idx - 1];
        this.addStep('borrowFromLeft', { parentId: parent.id, childId: child.id, leftSiblingId: leftSibling.id });

        // Move parent's key down to child
        const keyFromParent = parent.keys[idx - 1];
        child.insertKey(keyFromParent); // insertKey handles shifting existing keys
        parent.operationTarget = true; // Mark parent key involved
        child.operationTarget = true; // Mark child where key is inserted
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id), reason: `Parent key ${keyFromParent} moves down` });
        this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id), reason: `Key ${keyFromParent} inserted from parent` });
        await this.delay(70);
        child.operationTarget = false;

        // Move left sibling's last key up to parent
        const keyFromSibling = leftSibling.keys.pop()!;
        parent.keys[idx - 1] = keyFromSibling;
        leftSibling.operationTarget = true; // Mark sibling where key is removed
        this.addStep('updateNode', { nodeId: leftSibling.id, keys: [...leftSibling.keys], childrenIds: leftSibling.isLeaf ? [] : leftSibling.children.map(c => c.id), reason: `Key ${keyFromSibling} removed` });
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id), reason: `Parent key replaced by ${keyFromSibling}` });
        await this.delay(70);
        parent.operationTarget = false;
        leftSibling.operationTarget = false;

        // Move left sibling's last child to child's first position if internal node
        if (!leftSibling.isLeaf) {
            const childToMove = leftSibling.children.pop()!;
            child.insertChild(0, childToMove);
            leftSibling.operationTarget = true; // Mark sibling where child is removed
            child.operationTarget = true; // Mark child where child is inserted
            this.addStep('updateNode', { nodeId: leftSibling.id, keys: [...leftSibling.keys], childrenIds: leftSibling.children.map(c => c.id), reason: `Child ${childToMove.id} removed` });
            this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.children.map(c => c.id), reason: `Child ${childToMove.id} inserted at beginning` });
            await this.delay(70);
            leftSibling.operationTarget = false;
            child.operationTarget = false;
        }
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id) }); // Final state
        this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id) });
        this.addStep('updateNode', { nodeId: leftSibling.id, keys: [...leftSibling.keys], childrenIds: leftSibling.isLeaf ? [] : leftSibling.children.map(c => c.id) });
    }

    private async borrowFromRight(parent: BTreeNode, idx: number): Promise<void> {
        const child = parent.children[idx];
        const rightSibling = parent.children[idx + 1];
        this.addStep('borrowFromRight', { parentId: parent.id, childId: child.id, rightSiblingId: rightSibling.id });

        // Move parent's key down to child
        const keyFromParent = parent.keys[idx];
        child.insertKey(keyFromParent); // insertKey appends at the end in this case
        parent.operationTarget = true;
        child.operationTarget = true;
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id), reason: `Parent key ${keyFromParent} moves down` });
        this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id), reason: `Key ${keyFromParent} inserted from parent` });
        await this.delay(70);
        child.operationTarget = false;

        // Move right sibling's first key up to parent
        const keyFromSibling = rightSibling.keys.shift()!;
        parent.keys[idx] = keyFromSibling;
        rightSibling.operationTarget = true;
        this.addStep('updateNode', { nodeId: rightSibling.id, keys: [...rightSibling.keys], childrenIds: rightSibling.isLeaf ? [] : rightSibling.children.map(c => c.id), reason: `Key ${keyFromSibling} removed` });
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id), reason: `Parent key replaced by ${keyFromSibling}` });
        await this.delay(70);
        parent.operationTarget = false;
        rightSibling.operationTarget = false;

        // Move right sibling's first child to child's last position if internal node
        if (!rightSibling.isLeaf) {
            const childToMove = rightSibling.children.shift()!;
            child.insertChild(child.children.length, childToMove); // Append child
            rightSibling.operationTarget = true;
            child.operationTarget = true;
            this.addStep('updateNode', { nodeId: rightSibling.id, keys: [...rightSibling.keys], childrenIds: rightSibling.children.map(c => c.id), reason: `Child ${childToMove.id} removed` });
            this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.children.map(c => c.id), reason: `Child ${childToMove.id} inserted at end` });
            await this.delay(70);
            rightSibling.operationTarget = false;
            child.operationTarget = false;
        }
         this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id) }); // Final state
         this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id) });
         this.addStep('updateNode', { nodeId: rightSibling.id, keys: [...rightSibling.keys], childrenIds: rightSibling.isLeaf ? [] : rightSibling.children.map(c => c.id) });
    }

    // Merges parent.children[idx+1] into parent.children[idx]
    // Assumes child and rightSibling have t-1 keys
    private async mergeChildren(parent: BTreeNode, idx: number): Promise<BTreeNode> {
        const child = parent.children[idx];
        const rightSibling = parent.children[idx + 1];
        const keyFromParent = parent.keys[idx];
        parent.highlight = 'merge';
        child.highlight = 'merge';
        rightSibling.highlight = 'merge';

        this.addStep('mergeChildren', { parentId: parent.id, leftChildId: child.id, rightChildId: rightSibling.id, parentKeyIndex: idx, parentKey: keyFromParent });
        await this.delay(50);

        // Move key from parent down to child
        child.insertKey(keyFromParent);
        child.operationTarget = true; // Mark merged key
        parent.operationTarget = true; // Mark removed parent key
        this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id), reason: `Parent key ${keyFromParent} moved down` });
        await this.delay(70);
        child.operationTarget = false;

        // Move all keys from rightSibling to child
        child.keys.push(...rightSibling.keys);
        child.operationTarget = true; // Mark merged keys
        rightSibling.operationTarget = true; // Mark emptied sibling
        this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.isLeaf ? [] : child.children.map(c => c.id), reason: `Keys from right sibling merged` });
        this.addStep('updateNode', { nodeId: rightSibling.id, keys: [], childrenIds: [], reason: `Keys moved to left sibling`}); // Show empty sibling
        await this.delay(70);
        child.operationTarget = false;

        // Move all children from rightSibling to child if internal node
        if (!child.isLeaf) {
            child.children.push(...rightSibling.children);
            // Update parent pointers for moved children
            rightSibling.children.forEach(movedChild => movedChild.parent = child);
             child.operationTarget = true; // Mark merged children area
             this.addStep('updateNode', { nodeId: child.id, keys: [...child.keys], childrenIds: child.children.map(c => c.id), reason: `Children from right sibling merged` });
             this.addStep('updateNode', { nodeId: rightSibling.id, keys: [], childrenIds: [], reason: `Children moved to left sibling`});
            await this.delay(70);
            child.operationTarget = false;
        }

        // Remove key and right child from parent
        parent.removeKey(keyFromParent); // removeKey uses findKey, should be correct
        parent.removeChild(idx + 1);
        rightSibling.operationTarget = true; // Mark the node that is conceptually removed
        this.addStep('updateNode', { nodeId: parent.id, keys: [...parent.keys], childrenIds: parent.children.map(c => c.id), reason: `Key ${keyFromParent} and right child removed` });
        this.addStep('nodeDeleted', { nodeId: rightSibling.id, reason: 'Merged into left sibling'}); // Mark right sibling as deleted
        await this.delay(70);
        parent.operationTarget = false;
        rightSibling.operationTarget = false;
        rightSibling.highlight = null; // Clear highlight from removed node

        // Clear highlights from remaining nodes
        parent.highlight = null;
        child.highlight = null;
        this.addStep('mergeEnd', { parentId: parent.id, mergedNodeId: child.id });
        return child; // Return the merged node
    }

     // --- Traversal (for debugging/verification) ---
    traverse(): number[] {
        const result: number[] = [];
        this._traverseRecursiveDebug(this.root, result);
        return result;
    }

    private _traverseRecursiveDebug(node: BTreeNode | null, result: number[]): void {
        if (node) {
            let i;
            for (i = 0; i < node.keys.length; i++) {
                if (!node.isLeaf) {
                    this._traverseRecursiveDebug(node.children[i], result);
                }
                result.push(node.keys[i]);
            }
            if (!node.isLeaf) {
                this._traverseRecursiveDebug(node.children[i], result);
            }
        }
    }
}
