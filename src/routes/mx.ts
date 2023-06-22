import { Request, ResponseToolkit, Server } from '@hapi/hapi'
import pack from '../../package.json'
import { ProxyTarget } from '@hapi/h2o2'
import { Boom } from '@hapi/boom'
import { IncomingMessage } from 'http'
import { Message } from '../clients/queue'

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/mx/{param*}',
    options: {
      handler: async function (request: Request, h: ResponseToolkit) {
        try {
          const queueName = server.queue().getQueueName(request.url.pathname)
          request.logger.debug({ queueName })

          const queueClient = server.queue().client.getQueueClient(queueName)

          const messages = await queueClient.receiveMessages()
          if (messages.receivedMessageItems.length <= 0) throw new Error(`no messages in queue ${queueName}`)
          const message = messages.receivedMessageItems[0]

          await queueClient.deleteMessage(message.messageId, message.popReceipt)
          request.logger.debug({ message }, 'processed message')

          const json = JSON.parse(message.messageText) as Message
          request.logger.debug({ json }, 'parsed json')

          const response = h.response(json.body).code(json.status)
          Object.entries(json.headers).forEach(([key, value]) => {
            response.header(key, value)
          })

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
}
