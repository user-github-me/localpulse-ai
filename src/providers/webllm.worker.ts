import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm';

// Runs the in-browser model off the main thread, so the side panel stays responsive.
const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (message: MessageEvent) => handler.onmessage(message);
