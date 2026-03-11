export class LiquidError extends Error {
  token: unknown;
  static is(obj: unknown): obj is LiquidError;
}
export class Liquid {
  constructor(options?: Record<string, unknown>);
  parse(template: string): object;
  render(tpl: object, context?: Record<string, unknown>): Promise<string>;
  parseAndRender(template: string, context?: Record<string, unknown>): Promise<string>;
  renderFile(filepath: string, context?: Record<string, unknown>): Promise<string>;
  parseFile(filepath: string): Promise<object>;
  registerFilter(name: string, fn: (...args: any[]) => any): void;
  registerTag(name: string, tagImpl: any): void;
  plugin(fn: (engine: Liquid) => void): void;
  express(): any;
  setTemplate(name: string, source: string): void;
  setTemplates(map: Record<string, string>): void;
}
