const createInitialState = (): Pick<CowSimulatorState, 'disk' | 'files' | 'eventLog'> => {
    let disk = initializeVirtualDisk(); // totalBlocks は cow-simulator.ts のデフォルト (9) を使う
    let files: FileEntry[] = [];
    const eventLog: string[] = ['Simulation initialized with 9 blocks.']; // メッセージ変更

    // サンプルファイル1作成
    const file1Result = createFileOnDisk(disk, files, 'README.md', '# CoW!'); // 内容変更
    if (file1Result) {
        disk = file1Result.newDisk;
        files = file1Result.newFiles;
        eventLog.unshift(`[Initial] File "${file1Result.newFile.name}" created.`);
    }

    // サンプルファイル2作成
    const file2Result = createFileOnDisk(disk, files, 'data.txt', 'Data1'); // 内容変更
    if (file2Result) {
        disk = file2Result.newDisk;
        files = file2Result.newFiles;
        eventLog.unshift(`[Initial] File "${file2Result.newFile.name}" created.`);
    }

    // サンプルファイル3 (空ファイル)
    // ... existing code ...
}
