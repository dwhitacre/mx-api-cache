import { Request, ResponseToolkit, Server } from '@hapi/hapi'
import pack from '../../package.json'
import { ProxyTarget } from '@hapi/h2o2'
import { Boom, badImplementation } from '@hapi/boom'
import { IncomingMessage } from 'http'

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/mx/{param*}',
    options: {
      handler: async function (request: Request, h: ResponseToolkit) {
        try {
          const queueClient = request.server.queue().getQueueClient(request.url.pathname)
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
          const blobClient = await request.server.blob().getBlobClient('/mx/maps/download', request.params.id)

          const blob = await request.server.blob().getBlob(blobClient)
          if (!blob) throw new Error(`blob dne for id ${request.params.id}`)

          return blob
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

  server.route({
    method: 'GET',
    path: '/mx-preload/rmc',
    options: {
      handler: async function (request: Request) {
        try {
          const queueClient = await request.server.queue().createQueueClient(`mx/${request.server.mx().searchUrl}`)
          const properties = await queueClient.getProperties()
          let currentSize = properties.approximateMessagesCount ?? 0

          while (currentSize < request.server.mx().preloadRmcSize) {
            const preload = await request.server.mx().preloadRmc()
            if (!preload) throw new Error('failed to preload')

            const track = preload.searchBody.results[0]
            if (!track) throw new Error('failed to find track in preload')

            const trackId = track.TrackID
            if (!trackId) throw new Error('failed to find track id in track in preload')

            await queueClient.sendMessage(
              JSON.stringify({
                body: preload.searchBody,
                status: 200,
                headers: {},
              }),
            )
            currentSize++
          }

          return { status: 'ok', msg: 'preloaded rmc' }
        } catch (err) {
          request.logger.error(err, 'failed to preload rmc')
          return badImplementation('failed to preload rmc')
        }
      },
      description: 'Preload rmc requests to the mx api.',
      notes: 'GET preload rmc requests to the mx api.',
      tags: ['api', 'mx', 'preload', 'rmc'],
    },
  })
}
