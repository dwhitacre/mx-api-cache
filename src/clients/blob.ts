import { Server } from '@hapi/hapi'
import { BlobClient, BlobServiceClient } from '@azure/storage-blob'
import { getQueueName } from './queue'

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

  getContainerClient(pathname: string) {
    const containerName = this.getContainerName(pathname)
    return this.client.getContainerClient(containerName)
  }

  async getBlobClient(pathname: string, blobname: string) {
    const containerClient = this.getContainerClient(pathname)
    if (!(await containerClient.exists())) throw new Error(`container does not exist for ${pathname}`)
    return containerClient.getBlobClient(blobname)
  }

  async getBlob(blobClient: BlobClient) {
    if (!(await blobClient.exists())) return null
    const download = await blobClient.download()
    await blobClient.deleteIfExists()
    return download.readableStreamBody
  }
}
