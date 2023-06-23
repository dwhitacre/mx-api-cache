import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
import pack from '../../package.json'
import { ProxyTarget } from '@hapi/h2o2'
import { Boom } from '@hapi/boom'
import { IncomingMessage } from 'http'
import { Message } from '../clients/queue'
import { DequeuedMessageItem } from '@azure/storage-queue'

async function getBody(json: Message, request: Request) {
  if (!json.isBodyBlob) return json.body

  const blobClient = await request.server.blob().getBlobClient(request.url.pathname, json.body)
  return request.server.blob().getBlob(blobClient)
}

async function getResponse(message: DequeuedMessageItem, request: Request, h: ResponseToolkit): Promise<ResponseObject> {
  const json = JSON.parse(message.messageText) as Message
  request.logger.debug({ json }, 'parsed json')

  const body = await getBody(json, request)
  request.logger.debug('parsed body')

  const response = h.response(body).code(json.status)
  Object.entries(json.headers).forEach(([key, value]) => {
    response.header(key, value)
  })

  return response
}

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

          const response = await getResponse(message, request, h)
          return response
        } catch (err) {
          request.logger.debug(err, 'failed to connect to queue or blob, falling back to proxy')
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
}
