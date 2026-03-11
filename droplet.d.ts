declare class LiquidError extends Error {
  token: unknown;
  static is(obj: unknown): obj is LiquidError;
}
declare class Droplet {
  constructor(options?: Record<string, unknown>);
  parseAndRender(template: string, data?: Record<string, unknown>): Promise<string>;
  registerFilter(name: string, fn: (...args: any[]) => any): void;
  registerTag(name: string, fn: (...args: any[]) => any): void;
  static filters: Record<string, (...args: any[]) => any>;
  static LiquidError: typeof LiquidError;
  static _internals: Record<string, (...args: any[]) => any>;
}
export = Droplet;
