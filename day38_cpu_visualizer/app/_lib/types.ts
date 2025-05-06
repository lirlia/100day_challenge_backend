// 命令のオペコード (例)
export enum OpCode {
  // データ転送系
  LOAD_VAL = "LOAD_VAL",   // 即値をレジスタにロード
  LOAD_MEM = "LOAD_MEM",   // メモリ値をレジスタにロード
  STORE_MEM = "STORE_MEM", // レジスタ値をメモリに格納
  MOV_REG = 'MOV_REG',     // レジスタ間コピー

  // 算術演算系
  ADD_REG = "ADD_REG",     // reg1 に reg2 の値を加算し、結果を reg3 (またはオペランドが2つの場合はreg1) に格納
  SUB_REG = 'SUB_REG',     // レジスタ同士を減算
  MUL_REG = 'MUL_REG',     // レジスタ同士を乗算 (簡易的に)
  DIV_REG = 'DIV_REG',     // レジスタ同士を除算 (簡易的に)

  // 比較命令 (追加)
  CMP_ZERO = 'CMP_ZERO',   // レジスタがゼロか比較
  CMP_REG = 'CMP_REG',     // レジスタ間比較 (将来用)

  // 制御フロー系 (今回は省略または非常に簡略化)
  JMP = "JMP",             // 無条件ジャンプ (アドレス/ラベルへ)
  JZ = 'JZ',               // ゼロならジャンプ
  JNZ = 'JNZ',             // 非ゼロならジャンプ

  // その他
  HALT = "HALT",           // 実行停止
  NOP = "NOP",             // 何もしない
  // PRINT_REG = "PRINT_REG", // レジスタ内容表示 (デバッグ用)

  // New opcodes for control flow
  CMP_REG_VAL = "CMP_REG_VAL", // レジスタと値を比較し、フラグを設定
  CMP_REG_REG = "CMP_REG_REG", // レジスタと別のレジスタを比較し、フラグを設定
  JMP_IF_EQ = "JMP_IF_EQ",     // 等しい場合 (ゼロフラグがセット) にジャンプ
  JMP_IF_NEQ = "JMP_IF_NEQ",   // 等しくない場合 (ゼロフラグがセットされていない) にジャンプ
  JMP_IF_LT = "JMP_IF_LT",     // より小さい場合 (例: 符号フラグや符号付き/なしの特定フラグ論理) にジャンプ
  JMP_IF_GT = "JMP_IF_GT",     // より大きい場合にジャンプ
  JMP_IF_LTE = "JMP_IF_LTE",   // より小さいか等しい場合にジャンプ
  JMP_IF_GTE = "JMP_IF_GTE",   // より大きいか等しい場合にジャンプ
}

// オペランドの型
export type Operand = string | number; // レジスタ名、メモリアドレス、即値など

// 1つのアセンブリ命令
export interface Instruction {
  opCode: OpCode;
  operands: Operand[];
  originalJsLine?: number; // 対応するJSコードの行番号 (任意)
  label?: string; // アセンブリコード内のラベル (ジャンプ先など)
}

// マシンコード (数値表現)
export type MachineCodeInstruction = number[]; // 例: [opCodeNum, operand1Num, operand2Num]

// CPUレジスタ
export interface Registers {
  pc: number;        // プログラムカウンタ
  acc: number;       // アキュムレータ
  r0: number;        // 汎用レジスタ0
  r1: number;        // 汎用レジスタ1
  r2: number;        // 汎用レジスタ2
  flags: Flags;      // CPUフラグ
  // 必要に応じて他のレジスタを追加
}

export interface Flags {
  zero: boolean;     // ゼロフラグ
  carry: boolean;    // キャリーフラグ
  negative: boolean; // 符号フラグ (大小比較用に追加)
  // 他のフラグ (オーバーフローなど) も必要に応じて追加
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
