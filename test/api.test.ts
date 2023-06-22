import { Server } from '@hapi/hapi'
import 'dotenv/config'
import Queue from '../src/clients/queue'
import { QueueClient } from '@azure/storage-queue'

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
        const createResponse = async (n: number) => {
          const response = {
            body: `{ "results": [{ "TrackID": ${n} }] }`,
            status: n,
            headers: { Test: `Header${n}` },
          }
          await queueClient.sendMessage(JSON.stringify(response))
        }
        const assertResponse = async (n: number) => {
          const response = await fetch(`${url}${pathname}${search}`)
          const data = await response.json()
          expect(response.status).toBe(n)
          expect(response.headers.get('Test')).toBe(`Header${n}`)
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: n }))
        }

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
    })
  })
})
