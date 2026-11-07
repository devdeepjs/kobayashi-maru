declare module "@earendil-works/pi-ai" {
  export interface Message {
    role: string;
    content: any;
    toolName?: string;
    isError?: boolean;
    [key: string]: any;
  }
}

declare module "@earendil-works/pi-coding-agent" {
  export interface ExtensionAPI {
    registerVirtualModel<T = any>(def: any): void;
    [key: string]: any;
  }
  export interface ExtensionContext {
    modelRegistry: any;
    [key: string]: any;
  }
  export interface ModelRoute<T = any> {
    model: any;
    thinkingLevel?: string;
    state?: T;
  }
  export interface ModelRouteRequest<T = any> {
    messages: any[];
    reason?: string;
    state?: T;
    failed?: any;
    previous?: any;
    thinkingLevel?: string;
    signal?: any;
    [key: string]: any;
  }
}
