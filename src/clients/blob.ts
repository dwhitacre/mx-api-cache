import { Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi'
import { BlobServiceClient } from '@azure/storage-blob'
import { Message, getQueueName } from './queue'

export type Body = Message & { isBodyBlob?: boolean }

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
    try {
      await this.client.createContainer(containerName)
      this.server.logger.warn('blob.getContainerClient: queue does not exist, created..')
    } catch {}
    return this.client.getContainerClient(containerName)
  }

  async getBlob(pathname: string, blobname: string) {
    const containerClient = await this.getContainerClient(pathname)
    const blobClient = containerClient.getBlobClient(blobname)

    if (!(await blobClient.exists())) return null

    const download = await blobClient.download()
    await blobClient.deleteIfExists()

    return download.readableStreamBody
  }

  async toResponse(stream: NodeJS.ReadableStream, request: Request, h: ResponseToolkit): Promise<ResponseObject> {
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

    const response = h.response(json.body).code(json.status)
    Object.entries(json.headers).forEach(([key, value]) => {
      response.header(key, value)
    })

    return response
  }

  async createBlob(pathname: string, blobname: string, body: Body) {
    const containerClient = await this.getContainerClient(pathname)
    const blockBlobClient = containerClient.getBlockBlobClient(blobname)

    const content = JSON.stringify(body)
    return blockBlobClient.upload(content, content.length)
  }
}
