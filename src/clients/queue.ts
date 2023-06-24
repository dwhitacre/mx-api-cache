import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
import { DequeuedMessageItem, QueueClient, QueueServiceClient } from '@azure/storage-queue'

export interface Message {
  body: string
  status: number
  headers: Record<string, string>
}

export function getQueueName(pathname: string) {
  return `${pathname.startsWith('/') ? pathname.slice(1) : pathname}`.replaceAll(/[/]/g, '-')
}

export default class Queue {
  readonly server: Server
  readonly connStr: string
  readonly client: QueueServiceClient

  constructor(server: Server, { connStr }: { connStr: string }) {
    this.server = server
    this.connStr = connStr
    this.client = QueueServiceClient.fromConnectionString(this.connStr)
  }

  getQueueName(pathname: string) {
    return getQueueName(pathname)
  }

  getQueueClient(pathname: string) {
    const queueName = this.getQueueName(pathname)
    return this.client.getQueueClient(queueName)
  }

  async getMessage(queueClient: QueueClient): Promise<DequeuedMessageItem> {
    const messages = await queueClient.receiveMessages()
    if (messages.receivedMessageItems.length <= 0) throw new Error(`no messages in queue ${queueClient.name}`)
    const message = messages.receivedMessageItems[0]

    await queueClient.deleteMessage(message.messageId, message.popReceipt)

    return message
  }

  async toResponse(message: DequeuedMessageItem, request: Request, h: ResponseToolkit): Promise<ResponseObject> {
    const json = JSON.parse(message.messageText) as Message
    request.logger.debug({ json }, 'parsed json')

    const response = h.response(json.body).code(json.status)
    Object.entries(json.headers).forEach(([key, value]) => {
      response.header(key, value)
    })

    return response
  }
}
