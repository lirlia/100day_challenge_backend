import {
  OpCode,
  type Instruction,
  type Registers,
  type Memory,
  type CpuState,
  type CompilationResult,
  type Operand,
  type MachineCodeInstruction,
} from './types';
import React from 'react'; // Reactフックのために追加

// --- 1. JavaScript Parser & Assembler ---

function parseJsToAssembly(jsCode: string): CompilationResult {
  const lines = jsCode.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  const instructions: Instruction[] = [];
  const sourceMap: Record<number, number> = {};
  const variableToAddressMap: Record<string, string> = {};
  let nextMemoryAddress = 0x1000; // 仮想的なメモリアドレス開始位置 (16進数で管理)
  let tempRegCounter = 0; // R0, R1, R2を巡回するためのカウンター

  const getTempRegister = (): string => {
    const reg = `r${tempRegCounter % 3}`;
    // 注意: 複雑な式ではレジスタが不足/上書きされる可能性がある。簡易的な実装。
    // 本来はレジスタ割り当てアルゴリズムが必要。
    // tempRegCounter++; // simple increment might overwrite too early
    return reg;
  };

  const getAddressForVar = (varName: string, allocate: boolean = false): string | null => {
    if (!variableToAddressMap[varName] && allocate) {
      const address = `mem_${nextMemoryAddress.toString(16).toUpperCase()}`;
      variableToAddressMap[varName] = address;
      nextMemoryAddress += 4; // 4バイト単位でアドレスを進める (仮定)
      return address;
    }
    return variableToAddressMap[varName] || null;
  };

  lines.forEach((line, jsLineIndex) => {
    let match;
    tempRegCounter = 0; // 各行でレジスタカウンタリセット (簡易的)

    if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+);?$/))) {
      const varName = match[1];
      const value = parseInt(match[2], 10);
      const address = getAddressForVar(varName, true); // 新規変数なのでアドレス割り当て
      const tempReg = getTempRegister(); // R0
      tempRegCounter++;

      if (address) {
        const instr1: Instruction = { opCode: OpCode.LOAD_VAL, operands: [value, tempReg], originalJsLine: jsLineIndex };
        instructions.push(instr1);
        sourceMap[instructions.length - 1] = jsLineIndex;

        const instr2: Instruction = { opCode: OpCode.STORE_MEM, operands: [tempReg, address], originalJsLine: jsLineIndex };
        instructions.push(instr2);
        sourceMap[instructions.length - 1] = jsLineIndex;
      } else {
        // Error handling - should not happen if allocate is true
        console.error("Failed to allocate address for:", varName);
      }
    }
    else if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
      const destVar = match[1];
      const sourceVar = match[2];
      const sourceAddr = getAddressForVar(sourceVar);
      const destAddr = getAddressForVar(destVar, true); // yは新規変数
      const tempReg = getTempRegister(); // R0
      tempRegCounter++;

      if (sourceAddr && destAddr) {
        const instr1: Instruction = { opCode: OpCode.LOAD_MEM, operands: [sourceAddr, tempReg], originalJsLine: jsLineIndex };
        instructions.push(instr1);
        sourceMap[instructions.length - 1] = jsLineIndex;

        const instr2: Instruction = { opCode: OpCode.STORE_MEM, operands: [tempReg, destAddr], originalJsLine: jsLineIndex };
        instructions.push(instr2);
        sourceMap[instructions.length - 1] = jsLineIndex;
      } else {
        console.error(`Variable not defined or failed to allocate address: ${sourceVar} or ${destVar}`);
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable or address error: ${line}`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length -1] = jsLineIndex;
      }
    }
    else if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\+\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
      const destVar = match[1];
      const var1 = match[2];
      const var2 = match[3];

      const addr1 = getAddressForVar(var1);
      const addr2 = getAddressForVar(var2);
      const destAddr = getAddressForVar(destVar, true);
      const reg1 = getTempRegister(); // R0
      tempRegCounter++;
      const reg2 = getTempRegister(); // R1
      tempRegCounter++;
      const destReg = getTempRegister(); // R2
      // Note: Very naive register use. This ADD might need R2 available before this line.
      // For a simple sequential model, R2 might be okay here.

      if (addr1 && addr2 && destAddr) {
        const instr1: Instruction = { opCode: OpCode.LOAD_MEM, operands: [addr1, reg1], originalJsLine: jsLineIndex };
        instructions.push(instr1);
        sourceMap[instructions.length - 1] = jsLineIndex;

        const instr2: Instruction = { opCode: OpCode.LOAD_MEM, operands: [addr2, reg2], originalJsLine: jsLineIndex };
        instructions.push(instr2);
        sourceMap[instructions.length - 1] = jsLineIndex;

        const instr3: Instruction = { opCode: OpCode.ADD_REG, operands: [reg1, reg2, destReg], originalJsLine: jsLineIndex };
        instructions.push(instr3);
        sourceMap[instructions.length - 1] = jsLineIndex;

        const instr4: Instruction = { opCode: OpCode.STORE_MEM, operands: [destReg, destAddr], originalJsLine: jsLineIndex };
        instructions.push(instr4);
        sourceMap[instructions.length - 1] = jsLineIndex;
      } else {
        console.error(`Variable not defined or failed to allocate address: ${var1}, ${var2} or ${destVar}`);
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable or address error: ${line}`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length -1] = jsLineIndex;
      }
    }
    else if (line.toLowerCase().includes('halt')) { // Support 'halt', '// HALT', 'HALT;'
      instructions.push({ opCode: OpCode.HALT, operands: [], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;
    } else if (line.startsWith('//') || line.length === 0) {
        // Comments or empty lines are ignored (must be after HALT check if HALT can be a comment)
    }
    else {
      console.warn(`Unsupported JS syntax: ${line}`);
      instructions.push({ opCode: OpCode.NOP, operands: [`Unsupported: ${line}`], originalJsLine: jsLineIndex });
      sourceMap[instructions.length -1] = jsLineIndex;
    }
  });

  const machineCode: MachineCodeInstruction[] = instructions.map(instr => {
    const opCodeNum = Object.values(OpCode).indexOf(instr.opCode) + 1;
    const operandsNum = instr.operands.map(op => {
      if (typeof op === 'number') return op;
      if (typeof op === 'string' && op.match(/^r[0-2]$/)) return parseInt(op.substring(1),10);
      // アドレス文字列も数値化が必要だが、ここでは簡易的に0
      if (typeof op === 'string' && op.startsWith('mem_')) {
        try {
          return parseInt(op.substring(4), 16); // mem_を除去して16進数パース
        } catch { return 0; }
      }
      return 0;
    });
    while(operandsNum.length < 2) operandsNum.push(0);
    return [opCodeNum, ...operandsNum.slice(0,2)];
  });

  return { assembly: instructions, machineCode, sourceMap };
}


// --- 2. CPU Simulation Engine ---

export function initializeCpuState(): CpuState {
  return {
    registers: {
      pc: 0,
      acc: 0,
      r0: 0,
      r1: 0,
      r2: 0,
      flags: { zero: false, carry: false },
    },
    memory: {},
    isRunning: true,
    currentJsLine: undefined,
    currentAssemblyLine: 0,
  };
}

export function stepExecute(currentState: CpuState, program: Instruction[]): CpuState {
  if (!currentState.isRunning || currentState.registers.pc >= program.length) {
    return { ...currentState, isRunning: false };
  }

  const instruction = program[currentState.registers.pc];
  // Use structuredClone for a more robust deep copy if available (Node.js >= 17)
  // const nextState = structuredClone(currentState);
  const nextState = JSON.parse(JSON.stringify(currentState)) as CpuState; // Fallback deep copy

  nextState.currentAssemblyLine = currentState.registers.pc;
  if (instruction.originalJsLine !== undefined) {
      nextState.currentJsLine = instruction.originalJsLine;
  }

  let incrementPC = true;

  try {
    switch (instruction.opCode) {
      case OpCode.LOAD_VAL: {
        const value = instruction.operands[0] as number;
        const regName = instruction.operands[1] as string;
        if (regName in nextState.registers) {
          nextState.registers[regName] = value;
        } else {
            throw new Error(`Unknown register ${regName} in LOAD_VAL`);
        }
        break;
      }
      case OpCode.STORE_MEM: { // STORE_MEM reg, addressKey
        const regName = instruction.operands[0] as string;
        const addressKey = instruction.operands[1] as string; // e.g., "mem_1000"
        if (regName in nextState.registers) {
          const valueToStore = nextState.registers[regName];
          // Ensure memory object exists
          if (!nextState.memory) {
              nextState.memory = {};
          }
          nextState.memory[addressKey] = Number(valueToStore); // Ensure value is number
          // console.log(`Memory Write: ${addressKey} = ${valueToStore}`); // Debug log
        } else {
          throw new Error(`Unknown register ${regName} in STORE_MEM`);
        }
        break;
      }
      case OpCode.LOAD_MEM: { // LOAD_MEM addressKey, reg
        const addressKey = instruction.operands[0] as string;
        const regName = instruction.operands[1] as string;
        if (regName in nextState.registers) {
          // Ensure memory object exists before reading
          const memoryExists = nextState.memory && (addressKey in nextState.memory);
          const valueLoaded = memoryExists ? nextState.memory[addressKey] : 0; // Default to 0 if not exists
          nextState.registers[regName] = valueLoaded;
          // console.log(`Memory Read: ${addressKey} -> ${valueLoaded} into ${regName}`); // Debug log
        } else {
          throw new Error(`Unknown register ${regName} in LOAD_MEM`);
        }
        break;
      }
      case OpCode.ADD_REG: {
        const reg1Name = instruction.operands[0] as string;
        const reg2Name = instruction.operands[1] as string;
        const destRegName = instruction.operands[2] as string;

        if (
             (reg1Name in nextState.registers) &&
             (reg2Name in nextState.registers) &&
             (destRegName in nextState.registers)
        ) {
          const val1 = Number(nextState.registers[reg1Name]);
          const val2 = Number(nextState.registers[reg2Name]);
          if (isNaN(val1) || isNaN(val2)) throw new Error(`Invalid number in ADD_REG operands: ${val1}, ${val2}`);
          const result = val1 + val2;
          nextState.registers[destRegName] = result;
          nextState.registers.flags.zero = result === 0;
          // TODO: Implement Carry flag logic for ADD
        } else {
            throw new Error(`Unknown register in ADD_REG: ${reg1Name}, ${reg2Name} or ${destRegName}`);
        }
        break;
      }
      case OpCode.HALT:
        nextState.isRunning = false;
        incrementPC = false;
        break;
      case OpCode.NOP:
        // Do nothing
        break;
      default:
        // Handle other opcodes like SUB, MUL, DIV, JMP etc. if added later
        throw new Error(`Unsupported OpCode execution: ${instruction.opCode}`);
    }
  } catch (e: any) {
    console.error(`Runtime Error at PC=${currentState.registers.pc}, Op=${instruction.opCode}, Operands=${instruction.operands.join(', ')}: ${e.message}`);
    nextState.isRunning = false; // Halt on runtime error
    // Consider adding error message to state: nextState.error = e.message;
  }

  if (incrementPC && nextState.isRunning) {
    nextState.registers.pc++;
  }

  // If PC reaches end without HALT, consider it halted
  if (nextState.registers.pc >= program.length && nextState.isRunning) {
    nextState.isRunning = false;
  }

  return nextState;
}

// --- Public API for the UI (React Hook) ---
export interface SimulationControl {
  cpuState: CpuState;
  program: Instruction[];
  machineCodeProgram: MachineCodeInstruction[];
  rawJsCode: string;
  sourceMap?: Record<number, number>;
  compileAndLoad: (jsCode: string) => void;
  step: () => void;
  reset: (keepJsCode?: boolean) => void;
  isProgramLoaded: () => boolean;
  getAssemblyForDisplay: () => string[];
  getMachineCodeForDisplay: () => string[];
}

export function useCpuSimulator(initialJsCode: string = ""): SimulationControl {
  const [rawJsCode, setRawJsCode] = React.useState<string>(initialJsCode);
  const [cpuState, setCpuState] = React.useState<CpuState>(initializeCpuState());
  const [program, setProgram] = React.useState<Instruction[]>([]);
  const [machineCodeProgram, setMachineCodeProgram] = React.useState<MachineCodeInstruction[]>([]);
  const [sourceMap, setSourceMap] = React.useState<Record<number, number> | undefined>(undefined);

  const compileAndLoad = (jsCodeToCompile: string) => {
    setRawJsCode(jsCodeToCompile);
    try {
      const result = parseJsToAssembly(jsCodeToCompile);
      setProgram(result.assembly);
      setMachineCodeProgram(result.machineCode);
      setSourceMap(result.sourceMap);
      setCpuState(initializeCpuState());
    } catch (e: any) {
        console.error("Compilation Error:", e.message);
        setProgram([{opCode: OpCode.NOP, operands: [`Compilation Error: ${e.message}`]}]);
        setMachineCodeProgram([]);
        setCpuState({...initializeCpuState(), isRunning: false});
    }
  };

  const step = () => {
    if (program.length > 0 && cpuState.isRunning && cpuState.registers.pc < program.length) {
      const nextState = stepExecute(cpuState, program);
      setCpuState(nextState);
    } else if (cpuState.isRunning && cpuState.registers.pc >= program.length) {
      // Auto-halt if PC is past the end and still running (e.g. no HALT instruction)
      setCpuState(prevState => ({...prevState, isRunning: false}));
    }
  };

  const reset = (keepJsCode: boolean = false) => {
    if (!keepJsCode) {
        setRawJsCode("");
        setProgram([]);
        setMachineCodeProgram([]);
        setSourceMap(undefined);
    }
    setCpuState(initializeCpuState());
  };

  const isProgramLoaded = () => program.length > 0;

  const getAssemblyForDisplay = (): string[] => {
      return program.map(instr => {
          return `${instr.opCode} ${instr.operands.join(', ')}`;
      });
  };

  const getMachineCodeForDisplay = (): string[] => {
      return machineCodeProgram.map(mcInstr =>
          mcInstr.map(num => num.toString(16).padStart(2, '0').toUpperCase()).join(' ')
      );
  };

  // Automatically compile initialJsCode if provided
  React.useEffect(() => {
    if (initialJsCode) {
      compileAndLoad(initialJsCode);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount if initialJsCode is present

  return {
    cpuState,
    program,
    machineCodeProgram,
    rawJsCode,
    sourceMap,
    compileAndLoad,
    step,
    reset,
    isProgramLoaded,
    getAssemblyForDisplay,
    getMachineCodeForDisplay,
  };
}
