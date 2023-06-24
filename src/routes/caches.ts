import { Request, Server } from '@hapi/hapi'
import { badGateway } from '@hapi/boom'
import { QueueMeta } from '../clients/queue'
import { ContainerMeta } from '../clients/blob'

export interface Backend {
  queues: Array<QueueMeta>
  containers: Array<ContainerMeta>
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
        const caches: Caches = { backend: { queues: [], containers: [] } }

        try {
          caches.backend.queues = await server.queue().list()
          caches.backend.containers = await server.blob().list()

          request.logger.debug({ caches }, 'caches')
          return caches
        } catch (err) {
          request.logger.error(err, 'failed to connect to backend')
          return badGateway('failed to connect to backend')
        }
      },
      description: 'Get all the current caches',
      notes: 'GET all the current caches and their sizes',
      tags: ['api', 'caches'],
    },
  })

  server.route({
    method: 'GET',
    path: '/caches/rmc',
    options: {
      handler: async function (request: Request) {},
      description: 'Preload the mx cache',
      notes: 'GET preload the mx cache',
      tags: ['api', 'caches'],
    },
  })
}
