import { WebWorkerMLCEngineHandler } from '@mlc-ai/web-llm'

const handler = new WebWorkerMLCEngineHandler()

self.onmessage = (event: MessageEvent<unknown>) => {
  handler.onmessage(event)
}
