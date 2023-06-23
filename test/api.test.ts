import { Server } from '@hapi/hapi'
import 'dotenv/config'
import Queue, { Message } from '../src/clients/queue'
import Blob from '../src/clients/blob'
import { QueueClient } from '@azure/storage-queue'
import { ContainerClient } from '@azure/storage-blob'

const url = `http://${process.env.HOST}:${process.env.PORT}`
const server = {} as Server
const azureConnStr = `${process.env.AZURE_STORAGE_CONNSTR}`

describe('api', function () {
  describe('/health', function () {
    it('should respond status ok', async function () {
      const response = await fetch(`${url}/health`)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.status).toBe('ok')
    })
  })

  describe('/*', function () {
    it('should return the home page', async function () {
      const response = await fetch(`${url}`)
      const data = await response.text()
      expect(response.status).toBe(200)
      expect(data).toContain('<!DOCTYPE html>')
    })
  })

  describe('/mx/*', function () {
    const id = 500

    describe('maps/download/:id', function () {
      it('should return the map file', async function () {
        const response = await fetch(`${url}/mx/maps/download/${id}`)
        const data = await response.text()
        expect(response.status).toBe(200)
        expect(data).toBe('map')
      })
    })

    describe('api/maps/get_map_info/multi/:id', function () {
      it('should return the map info for the id', async function () {
        const response = await fetch(`${url}/mx/api/maps/get_map_info/multi/${id}`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data).toContainEqual(expect.objectContaining({ TrackID: id }))
      })
    })

    describe('api/tags/gettags', function () {
      it('should return the tags', async function () {
        const response = await fetch(`${url}/mx/api/tags/gettags`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data).toContainEqual(
          expect.objectContaining({
            ID: 2,
            Name: 'FullSpeed',
          }),
        )
      })
    })

    describe('mapsearch2/search', function () {
      const pathname = '/mx/mapsearch2/search'
      const search = '?api=on&random=1&etags=23,37,40&lengthop=1&length=9&vehicles=1&mtype=TM_Race'
      let queue: Queue
      let queueName: string
      let queueClient: QueueClient

      const createResponse = async (n: number, bodyBlob?: string) => {
        const body = `{ "results": [{ "TrackID": ${n} }] }`
        const response = {
          body: bodyBlob ?? body,
          isBodyBlob: !!bodyBlob,
          status: n,
          headers: { Test: `Header${n}` },
        } as Message
        await queueClient.sendMessage(JSON.stringify(response))
        return body
      }

      const assertResponse = async (n: number) => {
        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()
        expect(response.status).toBe(n)
        expect(response.headers.get('Test')).toBe(`Header${n}`)
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: n }))
      }

      beforeEach(async function () {
        queue = new Queue(server, {
          connStr: azureConnStr,
        })
        queueName = queue.getQueueName(pathname)

        try {
          await queue.client.deleteQueue(queueName)
        } catch {}
        await queue.client.createQueue(queueName)
        queueClient = queue.client.getQueueClient(queueName)
      })

      it('should return a random map from api if queue dne', async function () {
        await queue.client.deleteQueue(queueName)

        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))
      })

      it('should return a random map from api if queue is empty', async function () {
        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))
      })

      it('should return a random map from queue', async function () {
        const body = '{ "results": [{ "TrackID": 123 }] }'
        const status = 234
        const headers = { Test: 'Header' }
        await queueClient.sendMessage(JSON.stringify({ body, status, headers }))

        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()

        expect(response.status).toBe(234)
        expect(response.headers.get('Test')).toBe('Header')
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: 123 }))
      })

      it('should remove the random map returned from queue', async function () {
        const body = '{ "results": [{ "TrackID": 123 }] }'
        const status = 234
        const headers = { Test: 'Header' }
        await queueClient.sendMessage(JSON.stringify({ body, status, headers }))

        const response = await fetch(`${url}${pathname}${search}`)
        await response.json()

        const messages = await queueClient.receiveMessages()
        expect(messages.receivedMessageItems).toHaveLength(0)
      })

      it('should return many random maps from queue', async function () {
        await createResponse(230)
        await createResponse(231)
        await createResponse(232)
        await assertResponse(230)
        await assertResponse(231)
        await createResponse(233)
        await assertResponse(232)
        await createResponse(234)
        await createResponse(235)
        await createResponse(236)
        await assertResponse(233)
        await assertResponse(234)
        await assertResponse(235)
        await assertResponse(236)

        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))

        await createResponse(237)
        await assertResponse(237)
      })

      describe('with blob', function () {
        let blob: Blob
        let containerName: string
        let containerClient: ContainerClient

        beforeEach(async function () {
          blob = new Blob(server, {
            connStr: azureConnStr,
          })
          containerName = blob.getContainerName(pathname)

          try {
            await blob.client.deleteContainer(containerName)
          } catch {}
          await blob.client.createContainer(containerName)
          containerClient = blob.client.getContainerClient(containerName)
        })

        it('should return a random map from api if blob container dne', async function () {
          await blob.client.deleteContainer(containerName)
          await createResponse(240, 'blobman')

          const response = await fetch(`${url}${pathname}${search}`)
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))
        })

        it('should return a random map from api if blob dne', async function () {
          await createResponse(240, 'blobman')

          const response = await fetch(`${url}${pathname}${search}`)
          const data = await response.json()

          expect(response.status).toBe(200)
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))
        })

        it('should return a random map from queue if blob exists', async function () {
          const body = await createResponse(240, 'blobman')

          const blockBlobClient = containerClient.getBlockBlobClient('blobman')
          await blockBlobClient.upload(body, body.length)

          const response = await fetch(`${url}${pathname}${search}`)
          const data = await response.json()

          expect(response.status).toBe(240)
          expect(response.headers.get('Test')).toBe('Header240')
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: 240 }))
        })

        it('should remove the random map returned from blob', async function () {
          const body = await createResponse(240, 'blobman')

          const blockBlobClient = containerClient.getBlockBlobClient('blobman')
          await blockBlobClient.upload(body, body.length)

          const response = await fetch(`${url}${pathname}${search}`)
          await response.json()

          expect(await blockBlobClient.exists()).toBeFalsy()
        })

        it('should return many random maps from queue from blob', async function () {
          const createResponseWithBlob = async (n: number, bodyBlob: string) => {
            const body = await createResponse(n, bodyBlob)

            const blockBlobClient = containerClient.getBlockBlobClient(bodyBlob)
            await blockBlobClient.upload(body, body.length)
          }

          await createResponseWithBlob(240, '240')
          await createResponse(241)
          await createResponseWithBlob(242, '242')
          await assertResponse(240)
          await assertResponse(241)
          await createResponseWithBlob(243, '243')
          await assertResponse(242)
          await createResponseWithBlob(244, '244')
          await createResponseWithBlob(245, '245')
          await createResponse(246)
          await assertResponse(243)
          await assertResponse(244)
          await assertResponse(245)
          await assertResponse(246)

          const response = await fetch(`${url}${pathname}${search}`)
          const data = await response.json()
          expect(response.status).toBe(200)
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))

          await createResponseWithBlob(247, '247')
          await assertResponse(247)
        })
      })
    })
  })
})
