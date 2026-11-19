/**
 * Small sound effects for what the player does, made by the mixer while it plays (no files). The engine and the screens call `cue`; nothing
 * listens on the server, in the bots or in a replay, so a cue can never change a night. They follow the one soundtrack switch.
 */
export type Cue = 'chain' | 'coin' | 'bell' | 'ding' | 'pop' | 'plop' | 'hammer' | 'flip';
export const cues: { listener: ((cue: Cue, n?: number) => void) | null } = { listener: null };
export const cue = (name: Cue, n = 0): void => cues.listener?.(name, n);
