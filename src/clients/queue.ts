import { Server } from '@hapi/hapi'
import { QueueServiceClient } from '@azure/storage-queue'

export interface Message {
  body: string
  status: number
  headers: Record<string, string>
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
    return `${pathname.startsWith('/') ? pathname.slice(1) : pathname}`.replaceAll(/[/]/g, '-')
  }
}
