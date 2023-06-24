import { Request, Server } from '@hapi/hapi'
import { badGateway } from '@hapi/boom'
import { QueueMeta } from '../clients/queue'

export interface Backend {
  queues: Array<QueueMeta>
}

export interface Caches {
  backend: Backend
}

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/caches',
    options: {
      handler: async function (request: Request) {
        const caches: Caches = { backend: { queues: [] } }

        try {
          caches.backend.queues = await server.queue().list()
          request.logger.debug({ caches }, 'caches')

          return caches
        } catch (err) {
          request.logger.error(err, 'failed to connect to queue')
          return badGateway('failed to connect to queue')
        }
      },
      description: 'Get all the current caches',
      notes: 'GET all the current caches and their sizes',
      tags: ['api', 'caches'],
    },
  })
}
