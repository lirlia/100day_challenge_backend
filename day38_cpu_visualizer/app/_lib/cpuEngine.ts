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
  console.log('[parseJsToAssembly] Initialized variableToAddressMap:', JSON.stringify(variableToAddressMap));
  let nextMemoryAddress = 0x1000;
  let tempRegCounter = 0;
  let labelCounter = 0; // ラベル生成用カウンター

  const getTempRegister = (): string => {
    const reg = `r${tempRegCounter % 3}`;
    return reg;
  };

  const getAddressForVar = (varName: string, allocate: boolean = false): string | null => {
    if (!variableToAddressMap[varName] && allocate) {
      const address = `mem_${nextMemoryAddress.toString(16).toUpperCase()}`;
      variableToAddressMap[varName] = address;
      nextMemoryAddress += 4;
      return address;
    }
    return variableToAddressMap[varName] || null;
  };

  const generateLabel = (prefix: string = 'L'): string => {
    labelCounter++;
    return `${prefix}${labelCounter}`;
  };

  // Main parsing loop - needs to handle block structures like if
  // This simple line-by-line approach will need to be smarter or use a multi-pass strategy for labels.
  // For now, we can try to parse simple if statements.

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const jsLineIndex = i;
    tempRegCounter = 0;
    console.log(`[parseJsToAssembly] Processing line ${jsLineIndex}: "${line}"`);

    let match;

    if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+);?$/))) {
      const varName = match[1];
      const value = parseInt(match[2], 10);
      console.log(`[parseJsToAssembly] Matched: let var = number. varName: ${varName}, value: ${value}. Current map:`, JSON.stringify(variableToAddressMap));
      const address = getAddressForVar(varName, true);
      const tempReg = getTempRegister();
      tempRegCounter++;
      if (address) {
        instructions.push({ opCode: OpCode.LOAD_VAL, operands: [value, tempReg], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
        instructions.push({ opCode: OpCode.STORE_MEM, operands: [tempReg, address], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
      }
    } else if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
      const destVar = match[1];
      const sourceVar = match[2];
      console.log(`[parseJsToAssembly] Matched: let destVar = sourceVar. destVar: ${destVar}, sourceVar: ${sourceVar}. Current map:`, JSON.stringify(variableToAddressMap));
      const sourceAddr = getAddressForVar(sourceVar);
      const destAddr = getAddressForVar(destVar, true);
      const tempReg = getTempRegister();
      tempRegCounter++;
      if (sourceAddr && destAddr) {
        instructions.push({ opCode: OpCode.LOAD_MEM, operands: [sourceAddr, tempReg], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
        instructions.push({ opCode: OpCode.STORE_MEM, operands: [tempReg, destAddr], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
      } else {
        console.error(`[parseJsToAssembly] ERROR (let destVar = sourceVar): Variable not defined or failed to allocate. sourceVar: ${sourceVar}, sourceAddr: ${sourceAddr}, destVar: ${destVar}, destAddr: ${destAddr}. Map:`, JSON.stringify(variableToAddressMap));
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable ${sourceVar}`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length-1] = jsLineIndex;
      }
    } else if ((match = line.match(/^let\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\+\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
      const destVar = match[1];
      const var1 = match[2];
      const var2 = match[3];
      console.log(`[parseJsToAssembly] Matched: let destVar = var1 + var2. destVar: ${destVar}, var1: ${var1}, var2: ${var2}. Current map:`, JSON.stringify(variableToAddressMap));
      const addr1 = getAddressForVar(var1);
      const addr2 = getAddressForVar(var2);
      const destAddr = getAddressForVar(destVar, true);
      const reg1 = getTempRegister(); tempRegCounter++;
      const reg2 = getTempRegister(); tempRegCounter++;
      const resReg = getTempRegister(); tempRegCounter++;
      if (addr1 && addr2 && destAddr) {
        instructions.push({ opCode: OpCode.LOAD_MEM, operands: [addr1, reg1], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
        instructions.push({ opCode: OpCode.LOAD_MEM, operands: [addr2, reg2], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
        instructions.push({ opCode: OpCode.ADD_REG, operands: [reg1, reg2, resReg], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
        instructions.push({ opCode: OpCode.STORE_MEM, operands: [resReg, destAddr], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
      } else {
        console.error(`[parseJsToAssembly] ERROR (let destVar = var1 + var2): Variable not defined. var1: ${var1}(${addr1}), var2: ${var2}(${addr2}), dest: ${destAddr}. Map:`, JSON.stringify(variableToAddressMap));
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable in sum`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length-1] = jsLineIndex;
      }
    } else if ((match = line.match(/^if\s*\(\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*([<>=!]{1,3})\s*(\d+)\s*\)\s*\{$/))) {
      const conditionVar = match[1];
      const operator = match[2];
      const conditionValue = parseInt(match[3], 10);
      console.log(`[parseJsToAssembly] Matched: if (var OP num) {. Var: ${conditionVar}, Op: ${operator}, Val: ${conditionValue}. Map:`, JSON.stringify(variableToAddressMap));

      const varAddr = getAddressForVar(conditionVar);
      if (!varAddr) {
        console.error(`[parseJsToAssembly] ERROR (if condition): Variable ${conditionVar} not defined. Map:`, JSON.stringify(variableToAddressMap));
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Undefined variable ${conditionVar} in if`], originalJsLine: jsLineIndex });
        sourceMap[instructions.length-1] = jsLineIndex;
        let blockEnd = i + 1;
        while(blockEnd < lines.length && !lines[blockEnd].match(/^\s*\}\s*$/)) blockEnd++;
        i = blockEnd;
        continue;
      }

      const tempReg = getTempRegister(); tempRegCounter++;
      instructions.push({ opCode: OpCode.LOAD_MEM, operands: [varAddr, tempReg], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;
      instructions.push({ opCode: OpCode.CMP_REG_VAL, operands: [tempReg, conditionValue], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;

      const endIfLabel = generateLabel('END_IF');
      let jumpOp: OpCode | null = null;

      switch (operator) {
        case '<': jumpOp = OpCode.JMP_IF_GTE; break;
        case '<=': jumpOp = OpCode.JMP_IF_GT; break;
        case '>': jumpOp = OpCode.JMP_IF_LTE; break;
        case '>=': jumpOp = OpCode.JMP_IF_LT; break;
        case '===':
        case '==': jumpOp = OpCode.JMP_IF_NEQ; break;
        case '!==':
        case '!=': jumpOp = OpCode.JMP_IF_EQ; break;
        default:
          console.error(`[parseJsToAssembly] ERROR (if condition): Unsupported operator ${operator}`);
          instructions.push({ opCode: OpCode.NOP, operands: [`Error: Unsupported operator ${operator} in if`], originalJsLine: jsLineIndex });
          sourceMap[instructions.length-1] = jsLineIndex;
          let blockEnd = i + 1;
          while(blockEnd < lines.length && !lines[blockEnd].match(/^\s*\}\s*$/)) blockEnd++;
          i = blockEnd;
          continue;
      }

      if (jumpOp) {
        instructions.push({ opCode: jumpOp, operands: [endIfLabel], originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
      }

      const ifBlockLineIndex = i + 1;
      if (ifBlockLineIndex < lines.length && !lines[ifBlockLineIndex].match(/^\s*\}\s*$/)) {
        const ifBlockLine = lines[ifBlockLineIndex];
        let blockMatch;
        if ((blockMatch = ifBlockLine.match(/^(?:let\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(\d+);?$/))) {
          const varName = blockMatch[1];
          const value = parseInt(blockMatch[2], 10);
          const destAddr = getAddressForVar(varName, true);
          const blkTempReg = getTempRegister(); tempRegCounter++;
          if (destAddr) {
            instructions.push({ opCode: OpCode.LOAD_VAL, operands: [value, blkTempReg], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
            instructions.push({ opCode: OpCode.STORE_MEM, operands: [blkTempReg, destAddr], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
          } else {
            console.error(`[parseJsToAssembly] ERROR (if-block assign number): Failed to get/allocate address for ${varName}`);
            instructions.push({ opCode: OpCode.NOP, operands: [`Error: Assign in if for ${varName}`], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
          }
        } else if ((blockMatch = ifBlockLine.match(/^(?:let\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z_][a-zA-Z0-9_]*);?$/))) {
          const destVar = blockMatch[1];
          const sourceVar = blockMatch[2];
          const sourceAddr = getAddressForVar(sourceVar);
          const destAddr = getAddressForVar(destVar, true);
          const blkTempReg = getTempRegister(); tempRegCounter++;
          if (sourceAddr && destAddr) {
            instructions.push({ opCode: OpCode.LOAD_MEM, operands: [sourceAddr, blkTempReg], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
            instructions.push({ opCode: OpCode.STORE_MEM, operands: [blkTempReg, destAddr], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
          } else {
             console.error(`[parseJsToAssembly] ERROR (if-block assign var): Var not defined or alloc failed. Source: ${sourceVar}, Dest: ${destVar}`);
             instructions.push({ opCode: OpCode.NOP, operands: [`Error: Assign in if ${sourceVar} to ${destVar}`], originalJsLine: ifBlockLineIndex });
             sourceMap[instructions.length - 1] = ifBlockLineIndex;
          }
        } else if (ifBlockLine.toLowerCase().includes('halt')) {
            instructions.push({ opCode: OpCode.HALT, operands: [], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
        } else {
            console.warn(`[parseJsToAssembly] Unsupported statement in if-block: ${ifBlockLine}`);
            instructions.push({ opCode: OpCode.NOP, operands: [`Unsupported in if: ${ifBlockLine}`], originalJsLine: ifBlockLineIndex });
            sourceMap[instructions.length - 1] = ifBlockLineIndex;
        }
        i++;
      } else {
          console.warn(`[parseJsToAssembly] Empty or malformed if-block starting at JS line: ${jsLineIndex}`);
      }

      if (i + 1 < lines.length && lines[i + 1].match(/^\s*\}\s*$/)) {
        i++;
        instructions.push({ opCode: OpCode.NOP, operands: [], label: endIfLabel, originalJsLine: i });
        sourceMap[instructions.length - 1] = i;
      } else {
        console.error(`[parseJsToAssembly] ERROR: Missing closing '}' for if statement that started at JS line ${jsLineIndex}. Current line: ${lines[i+1]}`);
        instructions.push({ opCode: OpCode.NOP, operands: [`Error: Missing '}' for if`], label: endIfLabel, originalJsLine: jsLineIndex });
        sourceMap[instructions.length - 1] = jsLineIndex;
      }
    } else if (line.toLowerCase().includes('halt')) {
      instructions.push({ opCode: OpCode.HALT, operands: [], originalJsLine: jsLineIndex });
      sourceMap[instructions.length - 1] = jsLineIndex;
    } else if (line.startsWith('//') || line.length === 0) {
    } else {
      console.warn(`Unsupported JS syntax: ${line}`);
      instructions.push({ opCode: OpCode.NOP, operands: [`Unsupported: ${line}`], originalJsLine: jsLineIndex });
      sourceMap[instructions.length-1] = jsLineIndex;
    }
  }

  const machineCode: MachineCodeInstruction[] = instructions.map(instr => {
    const opCodeNum = Object.values(OpCode).indexOf(instr.opCode) + 1;
    const operandsNum = instr.operands.map(op => {
      if (typeof op === 'number') return op;
      if (typeof op === 'string' && op.match(/^r[0-2]$/)) return parseInt(op.substring(1),10);
      if (typeof op === 'string' && op.startsWith('mem_')) {
        try { return parseInt(op.substring(4), 16); } catch { return 0; }
      }
      if (typeof op === 'string') return 0;
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
      flags: { zero: false, carry: false, negative: false },
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

  // Helper function to find label (moved to the top of the function scope)
  const findLabelIndex = (label: string): number => {
    const index = program.findIndex(instr => instr.label === label);
    if (index === -1) throw new Error(`Label ${label} not found`);
    return index;
  };

  const instruction = program[currentState.registers.pc];
  const nextState = JSON.parse(JSON.stringify(currentState)) as CpuState;

  nextState.currentAssemblyLine = currentState.registers.pc;
  if (instruction.originalJsLine !== undefined) {
      nextState.currentJsLine = instruction.originalJsLine;
  }

  let incrementPC = true;
  let jumpTaken = false;

  try {
    switch (instruction.opCode) {
      case OpCode.LOAD_VAL: {
        const value = instruction.operands[0] as number;
        const regName = instruction.operands[1] as string;
        if (regName in nextState.registers) {
          (nextState.registers as any)[regName] = value;
        } else {
            throw new Error(`Unknown register ${regName} in LOAD_VAL`);
        }
        break;
      }
      case OpCode.STORE_MEM: { // STORE_MEM reg, addressKey
        const regName = instruction.operands[0] as string;
        const addressKey = instruction.operands[1] as string;
        if (regName in nextState.registers) {
          const valueToStore = (nextState.registers as any)[regName];
          if (!nextState.memory) {
              nextState.memory = {};
          }
          nextState.memory[addressKey] = Number(valueToStore);
        } else {
          throw new Error(`Unknown register ${regName} in STORE_MEM`);
        }
        break;
      }
      case OpCode.LOAD_MEM: { // LOAD_MEM addressKey, reg
        const addressKey = instruction.operands[0] as string;
        const regName = instruction.operands[1] as string;
        if (regName in nextState.registers) {
          const memoryExists = nextState.memory && (addressKey in nextState.memory);
          const valueLoaded = memoryExists ? nextState.memory[addressKey] : 0;
          (nextState.registers as any)[regName] = valueLoaded;
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
          const val1 = Number((nextState.registers as any)[reg1Name]);
          const val2 = Number((nextState.registers as any)[reg2Name]);
          if (isNaN(val1) || isNaN(val2)) throw new Error(`Invalid number in ADD_REG operands: ${val1}, ${val2}`);
          const result = val1 + val2;
          (nextState.registers as any)[destRegName] = result;
          nextState.registers.flags.zero = result === 0;
          nextState.registers.flags.negative = result < 0; // Assuming signed addition for negative flag
          // TODO: Implement Carry flag logic for ADD more accurately
        } else {
            throw new Error(`Unknown register in ADD_REG: ${reg1Name}, ${reg2Name} or ${destRegName}`);
        }
        break;
      }
      case OpCode.CMP_REG_VAL: { // CMP_REG_VAL reg, value
        const regName = instruction.operands[0] as string;
        const value = instruction.operands[1] as number;
        if (regName in nextState.registers) {
          const regValue = Number((nextState.registers as any)[regName]);
          if (isNaN(regValue) || isNaN(value)) throw new Error(`Invalid number in CMP_REG_VAL operands: ${regValue}, ${value}`);
          const result = regValue - value; // Perform subtraction to set flags
          nextState.registers.flags.zero = result === 0;
          nextState.registers.flags.negative = result < 0;
          // Carry flag for CMP (a - b): set if no borrow occurred (a >= b for unsigned)
          // Or, more simply for now for signed: if regValue < value, and result is negative without overflow, it might be complex.
          // Let's keep carry simple: carry is true if regValue >= value (unsigned sense)
          nextState.registers.flags.carry = regValue >= value;
        } else {
          throw new Error(`Unknown register ${regName} in CMP_REG_VAL`);
        }
        break;
      }
      // JMP opcodes now correctly see findLabelIndex
      case OpCode.JMP: {
        const label = instruction.operands[0] as string;
        nextState.registers.pc = findLabelIndex(label);
        incrementPC = false;
        jumpTaken = true;
        break;
      }
      case OpCode.JMP_IF_EQ: { // Jump if Zero flag is true
        if (nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
        }
        break;
      }
      case OpCode.JMP_IF_NEQ: { // Jump if Zero flag is false
        if (!nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
        }
        break;
      }
      case OpCode.JMP_IF_LT: { // Jump if Negative flag is true (and Zero is false, for strict less than)
        if (nextState.registers.flags.negative && !nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
        }
        break;
      }
      case OpCode.JMP_IF_GTE: { // Jump if Negative is false OR Zero is true
        if (!nextState.registers.flags.negative || nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
        }
        break;
      }
      case OpCode.JMP_IF_GT: { // Jump if Negative is false AND Zero is false
        if (!nextState.registers.flags.negative && !nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
        }
        break;
      }
      case OpCode.JMP_IF_LTE: { // Jump if Negative is true OR Zero is true
         if (nextState.registers.flags.negative || nextState.registers.flags.zero) {
          const label = instruction.operands[0] as string;
          nextState.registers.pc = findLabelIndex(label);
          incrementPC = false;
          jumpTaken = true;
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
        throw new Error(`Unsupported OpCode execution: ${instruction.opCode}`);
    }
  } catch (e: any) {
    console.error(`Runtime Error at PC=${currentState.registers.pc}, Op=${instruction.opCode}, Operands=${instruction.operands.join(', ')}: ${e.message}`);
    nextState.isRunning = false;
  }

  if (incrementPC && nextState.isRunning && !jumpTaken) { // jumpTaken をチェック
    nextState.registers.pc++;
  }

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
