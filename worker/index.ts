import { handleCanvasRelay } from './canvasRelay'

export default {
  async fetch(request, env): Promise<Response> {
    return handleCanvasRelay(request, env)
  },
} satisfies ExportedHandler<Env>
