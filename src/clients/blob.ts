import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
import { BlobServiceClient } from '@azure/storage-blob'
import { Message, QueueMeta, getQueueName } from './queue'
import { IncomingMessage } from 'http'

export type Body = Message & { isBodyBlobId?: boolean }

export type ContainerMeta = QueueMeta

export default class Blob {
  readonly server: Server
  readonly connStr: string
  readonly client: BlobServiceClient

  constructor(server: Server, { connStr }: { connStr: string }) {
    this.server = server
    this.connStr = connStr
    this.client = BlobServiceClient.fromConnectionString(this.connStr)
  }

  getContainerName(pathname: string) {
    return getQueueName(pathname)
  }

  async getContainerClient(pathname: string) {
    const containerName = this.getContainerName(pathname)
    const containerClient = this.client.getContainerClient(containerName)
    await containerClient.createIfNotExists()
    return containerClient
  }

  async getBlob(pathname: string, blobname: string) {
    const containerClient = await this.getContainerClient(pathname)
    const blobClient = containerClient.getBlobClient(blobname)

    if (!(await blobClient.exists())) return null

    const download = await blobClient.download()
    await blobClient.deleteIfExists()

    return download.readableStreamBody
  }

  async toResponse(pathname: string, stream: NodeJS.ReadableStream, request: Request, h: ResponseToolkit): Promise<ResponseObject> {
    const json = (await new Promise((resolve, reject) => {
      let chunks = ''
      stream.on('data', (chunk) => (chunks += chunk))
      stream.on('end', () => {
        try {
          resolve(JSON.parse(chunks))
        } catch (err) {
          reject(err)
        }
      })
      stream.on('error', reject)
    })) as Body
    request.logger.debug({ json }, 'parsed json')

    let body: string | NodeJS.ReadableStream = json.body
    if (json.isBodyBlobId) {
      const content = await this.getBlob(pathname, body)
      if (!content) throw new Error('failed to get body blob')
      body = content
    }

    const response = h.response(body).code(json.status)
    Object.entries(json.headers).forEach(([key, value]) => {
      response.header(key, value)
    })

    return response
  }

  async createBlob(pathname: string, blobname: string, body: Body | IncomingMessage | string) {
    const containerClient = await this.getContainerClient(pathname)
    const blockBlobClient = containerClient.getBlockBlobClient(blobname)

    if (body instanceof IncomingMessage) {
      return blockBlobClient.uploadStream(body)
    }

    const content = typeof body == 'string' ? body : JSON.stringify(body)
    return blockBlobClient.upload(content, content.length)
  }

  async list(): Promise<Array<ContainerMeta>> {
    const containers = []
    for await (const containerItem of this.client.listContainers()) {
      const containerClient = this.client.getContainerClient(containerItem.name)

      let blobCount = 0
      for await (const _ of containerClient.listBlobsFlat()) {
        blobCount++
      }
      containers.push({ name: containerItem.name, size: blobCount })
    }
    return containers
  }
}
