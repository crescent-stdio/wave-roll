declare module "tone" {
  namespace Tone {
    class Sampler { constructor(...args: any[]); loaded: Promise<void>; volume: any; connect(dest: any): any; toDestination(): any; }
    class Panner { constructor(...args: any[]); toDestination(): any; dispose(): void; pan: { value: number } }
    class Part { constructor(...args: any[]); start(time?: any, offset?: any): any; stop(): any; cancel(): any; }
    class GrainPlayer { constructor(...args: any[]); start(): any; stop(): any; volume: any; buffer: any; }
    const context: any;
    function getTransport(): any;
    function start(): Promise<void>;
    function loaded(): Promise<void>;
    function gainToDb(n: number): number;
  }
  const ToneExport: typeof Tone & any;
  export = ToneExport;
}
