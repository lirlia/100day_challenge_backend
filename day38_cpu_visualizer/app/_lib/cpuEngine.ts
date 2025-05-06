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
  const variableToRegisterMap: Record<string, string> = {};
  let regCounter = 0;

  lines.forEach((line, jsLineIndex) => {
    let match;

    if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+);?$/))) {
      const varName = match[1];
      const value = parseInt(match[2], 10);
      const targetReg = `r${regCounter % 3}`;
      variableToRegisterMap[varName] = targetReg;
      regCounter++;

      instructions.push({ opCode: OpCode.LOAD_VAL, operands: [value, targetReg], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;
    }
    else if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\+\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
      const destVar = match[1];
      const var1 = match[2];
      const var2 = match[3];

      const reg1 = variableToRegisterMap[var1];
      const reg2 = variableToRegisterMap[var2];
      const destReg = `r${regCounter % 3}`;
      variableToRegisterMap[destVar] = destReg;
      regCounter++;

      if (!reg1 || !reg2) {
        console.error(`Error: Variable not defined before use in line: ${line}`);
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable in: ${line}`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length -1] = jsLineIndex;
        return;
      }

      instructions.push({ opCode: OpCode.ADD_REG, operands: [reg1, reg2, destReg], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;
    } else if (line.startsWith('//') || line.length === 0) {
        // Comments or empty lines are ignored
    }
    else {
      console.warn(`Unsupported JS syntax: ${line}`);
      instructions.push({ opCode: OpCode.NOP, operands: [`Unsupported: ${line}`], originalJsLine: jsLineIndex });
      sourceMap[instructions.length -1] = jsLineIndex;
    }
  });

  const machineCode: MachineCodeInstruction[] = instructions.map(instr => {
    const opCodeNum = Object.values(OpCode).indexOf(instr.opCode) + 1; // 0はエラーやNOPにしたいので+1
    const operandsNum = instr.operands.map(op => {
        if (typeof op === 'number') return op;
        if (typeof op === 'string' && op.match(/^r[0-2]$/)) return parseInt(op.substring(1),10);
        return 0;
    });
    // 固定長っぽくするため、オペランドが不足する場合は0で埋める (例: 最大3オペランド)
    while(operandsNum.length < 2) operandsNum.push(0); // 最小2オペランドと仮定
    return [opCodeNum, ...operandsNum.slice(0,2)]; // オペコード + 最大2オペランド
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
  const nextState = JSON.parse(JSON.stringify(currentState)) as CpuState;
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
      case OpCode.ADD_REG: {
        const reg1Name = instruction.operands[0] as string;
        const reg2Name = instruction.operands[1] as string;
        const destRegName = instruction.operands[2] as string;

        if ( (reg1Name in nextState.registers) &&
             (reg2Name in nextState.registers) &&
             (destRegName in nextState.registers)
        ) {
          const val1 = Number(nextState.registers[reg1Name]);
          const val2 = Number(nextState.registers[reg2Name]);
          if (isNaN(val1) || isNaN(val2)) throw new Error(`Invalid number in ADD_REG: ${val1}, ${val2}`);
          const result = val1 + val2;
          nextState.registers[destRegName] = result;
          nextState.registers.flags.zero = result === 0;
        } else {
            throw new Error(`Unknown register in ADD_REG: ${reg1Name} or ${reg2Name} or ${destRegName}`);
        }
        break;
      }
      case OpCode.STORE_MEM:
      case OpCode.LOAD_MEM:
        // NOP for now, as we are register-centric
        break;
      case OpCode.HALT:
        nextState.isRunning = false;
        incrementPC = false;
        break;
      case OpCode.NOP:
        break;
      default:
        throw new Error(`Unknown OpCode: ${instruction.opCode}`);
    }
  } catch (e: any) {
    console.error(`Runtime Error at PC=${currentState.registers.pc}, Op=${instruction.opCode}: ${e.message}`);
    nextState.isRunning = false;
    // エラーメッセージをどこかに表示する手段があると良い (例: state.errorMessage)
  }

  if (incrementPC && nextState.isRunning) {
    nextState.registers.pc++;
  }
  if (nextState.registers.pc >= program.length && nextState.isRunning) {
      // nextState.isRunning = false; // Do not halt automatically, HALT instruction should do this.
      // If PC goes beyond program without HALT, it's an implicit halt or error.
      // For now, let it run until HALT or error for clarity in step execution.
  }
  // if PC is at program.length and it was not halted, it means it completed all instructions.
  if (nextState.registers.pc >= program.length && !program.find(p => p.opCode === OpCode.HALT)) {
    nextState.isRunning = false; // If no HALT and end of program, stop.
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
