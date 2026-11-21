# RISC-V Pipeline Visualizer

A browser-based simulator for stepping through a simple five-stage RISC-V pipeline. Watch instructions move through IF, ID, EX, MEM, and WB while the visualizer shows stalls, data forwarding, branch flushes, register values, and memory updates.

## Getting started

Open `riscv-pipeline-visualizer.html` in a modern web browser. No build step or installation is required.

## Using the visualizer

- **Step** advances the pipeline by one clock cycle.
- **Back** returns to the previous cycle.
- **Run** automatically advances the simulation; select it again to pause.
- **Reset** restarts the program with its current source.
- Choose an example program from the preset menu, or edit the assembly in the Program box.
- Toggle **Data forwarding** to compare forwarding with pipeline stalls.
- Use the left and right arrow keys to step forward and backward when focus is outside the text area and preset menu.

The timing diagram highlights stalled and flushed instructions. The dashboard also displays cycle count, retired instructions, CPI, stall cycles, flushes, registers, memory, and recent events.

## Supported assembly

The simulator supports these instructions:

| Instruction | Example |
| --- | --- |
| `add`, `sub`, `and`, `or` | `add x3, x1, x2` |
| `addi` | `addi x1, x0, 5` |
| `lw` | `lw x2, 0(x1)` |
| `sw` | `sw x2, 0(x1)` |
| `beq`, `bne` | `bne x1, x0, loop` |
| `nop` | `nop` |

Registers are named `x0` through `x31`; `x0` always reads as zero. Labels can be used as branch targets, and `#` starts a comment. The simulator models a simplified, in-order, five-stage pipeline for educational visualization rather than a complete RISC-V implementation.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
