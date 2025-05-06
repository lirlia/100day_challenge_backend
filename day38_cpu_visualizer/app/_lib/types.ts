// 命令のオペコード (例)
export enum OpCode {
  // データ転送系
  LOAD_VAL = 'LOAD_VAL', // レジスタに即値をロード
  LOAD_MEM = 'LOAD_MEM', // メモリからレジスタにロード
  STORE_MEM = 'STORE_MEM', // レジスタからメモリにストア
  MOV_REG = 'MOV_REG',   // レジスタ間コピー

  // 算術演算系
  ADD_REG = 'ADD_REG',   // レジスタ同士を加算
  SUB_REG = 'SUB_REG',   // レジスタ同士を減算
  MUL_REG = 'MUL_REG',   // レジスタ同士を乗算 (簡易的に)
  DIV_REG = 'DIV_REG',   // レジスタ同士を除算 (簡易的に)

  // 制御フロー系 (今回は省略または非常に簡略化)
  JMP = 'JMP',       // 無条件ジャンプ
  JZ = 'JZ',         // ゼロならジャンプ
  JNZ = 'JNZ',       // 非ゼロならジャンプ

  // その他
  HALT = 'HALT',       // 停止
  NOP = 'NOP',         // 何もしない
  PRINT_REG = 'PRINT_REG', // レジスタ内容表示 (デバッグ用)
}

// オペランドの型
export type Operand = string | number; // レジスタ名、メモリアドレス、即値など

// 1つのアセンブリ命令
export interface Instruction {
  opCode: OpCode;
  operands: Operand[];
  originalJsLine?: number; // 対応するJSコードの行番号 (任意)
}

// マシンコード (数値表現)
export type MachineCodeInstruction = number[]; // 例: [opCodeNum, operand1Num, operand2Num]

// CPUレジスタ
export interface Registers {
  pc: number; // プログラムカウンタ (次に実行する命令のアドレス/インデックス)
  acc: number; // アキュムレータ (汎用的な計算結果格納)
  r0: number; // 汎用レジスタ0
  r1: number; // 汎用レジスタ1
  r2: number; // 汎用レジスタ2
  // 必要に応じて他のレジスタ (スタックポインタ SP, フラグレジスタ FLAGS など) を追加
  flags: {
    zero: boolean;
    carry: boolean;
    // 他のフラグ
  };
  [key: string]: any; // インデックスシグネチャ
}

// メモリ
export type Memory = Record<string, number>; // アドレス(文字列) -> 値(数値) のマップで簡易表現

// CPUの状態
export interface CpuState {
  registers: Registers;
  memory: Memory;
  isRunning: boolean;
  currentJsLine?: number;
  currentAssemblyLine?: number;
}

// JavaScriptからアセンブリへの変換結果
export interface CompilationResult {
  assembly: Instruction[];
  machineCode: MachineCodeInstruction[]; // Optional: 同時にマシンコードも生成する場合
  sourceMap?: Record<number, number>; // アセンブリ行 -> JS行 のマッピング
}
