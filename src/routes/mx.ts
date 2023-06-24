import { Request, ResponseToolkit, Server } from '@hapi/hapi'
import pack from '../../package.json'
import { ProxyTarget } from '@hapi/h2o2'
import { Boom } from '@hapi/boom'
import { IncomingMessage } from 'http'

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/mx/{param*}',
    options: {
      handler: async function (request: Request, h: ResponseToolkit) {
        try {
          const queueClient = await request.server.queue().getQueueClient(request.url.pathname)
          request.logger.debug({ queueName: queueClient.name })

          const message = await request.server.queue().getMessage(queueClient)
          request.logger.debug({ message }, 'processed message')

          const response = await request.server.queue().toResponse(message, request, h)
          return response
        } catch (err) {
          request.logger.debug(err, 'failed to connect to queue, falling back to proxy')
          return h.proxy({
            mapUri: async function (request: Request) {
              const target: ProxyTarget = {
                uri: `${server.mx().baseUrl}/${request.params.param}${request.url.search}`,
                headers: {
                  'User-Agent': request.headers['user-agent'] ?? `${pack.name}:${pack.version}`,
                },
              }
              return target
            },
            onResponse: async function (_: Boom | null, response: IncomingMessage) {
              return response
            },
          })
        }
      },
      description: 'Proxy to the mx api.',
      notes: 'GET proxy to the mx api.',
      tags: ['api', 'mx'],
    },
  })

  server.route({
    method: 'GET',
    path: '/mx/maps/download/{id}',
    options: {
      handler: async function (request: Request, h: ResponseToolkit) {
        try {
          const blob = await request.server.blob().getBlob('/mx/maps/download', request.params.id)
          if (!blob) throw new Error(`blob dne for id ${request.params.id}`)

          return request.server.blob().toResponse(blob, request, h)
        } catch (err) {
          request.logger.debug(err, 'failed to connect to blob, falling back to proxy')
          return h.proxy({
            mapUri: async function (request: Request) {
              const target: ProxyTarget = {
                uri: `${server.mx().baseUrl}/maps/download/${request.params.id}`,
                headers: {
                  'User-Agent': request.headers['user-agent'] ?? `${pack.name}:${pack.version}`,
                },
              }
              return target
            },
            onResponse: async function (_: Boom | null, response: IncomingMessage) {
              return response
            },
          })
        }
      },
      description: 'Proxy map downloads to the mx api.',
      notes: 'GET proxy map downloads to the mx api.',
      tags: ['api', 'mx'],
    },
  })
}
