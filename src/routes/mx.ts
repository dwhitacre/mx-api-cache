import { Request, ResponseToolkit, Server } from '@hapi/hapi'

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
          request.logger.debug(err, 'failed to connect to queue, falling back to redirect')
          return h.redirect(`${server.mx().baseUrl}/${request.params.param}${request.url.search}`)
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
        const pathname = '/mx/maps/download'
        try {
          const blob = await request.server.blob().getBlob(pathname, request.params.id)
          if (!blob) throw new Error(`blob dne for id ${request.params.id}`)

          const response = await request.server.blob().toResponse(pathname, blob, request, h)
          return response
        } catch (err) {
          request.logger.debug(err, 'failed to connect to blob, falling back to redirect')
          return h.redirect(`${server.mx().baseUrl}/maps/download/${request.params.id}`)
        }
      },
      description: 'Proxy map downloads to the mx api.',
      notes: 'GET proxy map downloads to the mx api.',
      tags: ['api', 'mx'],
    },
  })
}
