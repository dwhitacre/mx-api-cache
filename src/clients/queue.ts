import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
import { DequeuedMessageItem, QueueClient, QueueServiceClient } from '@azure/storage-queue'

export interface Message {
  body: string
  status: number
  headers: Record<string, string>
}

export interface QueueMeta {
  name: string
  size: number
}

export function getQueueName(pathname: string) {
  return `${pathname.startsWith('/') ? pathname.slice(1) : pathname}`.replaceAll(/[/]/g, '-')
}

export default class Queue {
  readonly server: Server
  readonly connStr: string
  readonly client: QueueServiceClient
  readonly messageTimeToLive: number

  private readonly days7 = 7 * 24 * 60 * 60

  constructor(server: Server, { connStr, messageTimeToLive }: { connStr: string; messageTimeToLive?: number }) {
    this.server = server
    this.connStr = connStr
    this.client = QueueServiceClient.fromConnectionString(this.connStr)
    this.messageTimeToLive = messageTimeToLive ?? this.days7
  }

  getQueueName(pathname: string) {
    return getQueueName(pathname)
  }

  async getQueueClient(pathname: string) {
    const queueName = this.getQueueName(pathname)
    const queueClient = this.client.getQueueClient(queueName)
    await queueClient.createIfNotExists()
    return queueClient
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

  async createMessage(pathname: string, message: Message) {
    const queueClient = await this.getQueueClient(pathname)
    const content = JSON.stringify(message)
    return queueClient.sendMessage(content, { messageTimeToLive: this.messageTimeToLive })
  }

  async list(): Promise<Array<QueueMeta>> {
    const queues = []
    for await (const queueItem of this.client.listQueues()) {
      const queueClient = this.client.getQueueClient(queueItem.name)
      const properties = await queueClient.getProperties()
      queues.push({ name: queueItem.name, size: properties.approximateMessagesCount ?? -1 })
    }
    return queues
  }
}
