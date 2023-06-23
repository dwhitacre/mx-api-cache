import { Request, Server } from '@hapi/hapi'
import { badGateway } from '@hapi/boom'

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/caches',
    options: {
      handler: async function (request: Request) {
        try {
          const queueList = request.server.queue().client.listQueues()

          const caches = []
          for await (const queueItem of queueList) {
            const queueClient = request.server.queue().client.getQueueClient(queueItem.name)
            const properties = await queueClient.getProperties()

            const cache = { name: queueItem.name, size: properties.approximateMessagesCount ?? -1 }
            caches.push(cache)
          }

          request.logger.debug({ caches }, 'caches')
          return { caches, total: caches.length }
        } catch (err) {
          request.logger.debug(err, 'failed to connect to queue')
          return badGateway('failed to connect to queue')
        }
      },
      description: 'Get all the current caches',
      notes: 'GET all the current caches and their sizes',
      tags: ['api', 'caches'],
    },
  })
}
