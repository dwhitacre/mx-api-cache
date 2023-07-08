import { Server } from '@hapi/hapi'
import 'dotenv/config'
import Queue from '../src/clients/queue'
import Blob from '../src/clients/blob'

const url = `http://${process.env.HOST}:${process.env.PORT}`
const server = {} as Server
const azureConnStr =
  'DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;'
let queue: Queue
let blob: Blob
const trackId = 501
const blobContent = (isBodyBlobId?: boolean) => ({
  body: 'bodymap',
  status: 250,
  headers: { Test: 'Header' },
  isBodyBlobId,
})
const bodyBlobContent = 'bodyblobmap'
const queueContent = (id = trackId) => ({
  body: `{ "results": [{ "TrackID": ${id} }] }`,
  status: 260,
  headers: { Test: 'Header' },
})

beforeEach(async () => {
  queue = new Queue(server, {
    connStr: azureConnStr,
  })
  blob = new Blob(server, {
    connStr: azureConnStr,
  })

  for await (const queueClient of queue.client.listQueues()) {
    await queue.client.deleteQueue(queueClient.name)
  }
  for await (const containerClient of blob.client.listContainers()) {
    await blob.client.deleteContainer(containerClient.name)
  }
})

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
    describe('maps/download/:id', function () {
      const pathname = '/mx/maps/download'
      const expectAPI = async (id = trackId) => {
        const response = await fetch(`${url}${pathname}/${id}`)
        const data = await response.text()

        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private')
        expect(data).toBe('map')
      }
      const expectBlob = async (id = trackId) => {
        const response = await fetch(`${url}${pathname}/${id}`)
        const data = await response.text()

        expect(response.status).toBe(blobContent().status)
        expect(response.headers.get('Test')).toBe('Header')
        expect(data).toBe(blobContent().body)
      }
      const expectBodyBlob = async (id = trackId) => {
        const response = await fetch(`${url}${pathname}/${id}`)
        const data = await response.text()

        expect(response.status).toBe(blobContent(true).status)
        expect(response.headers.get('Test')).toBe('Header')
        expect(data).toBe(bodyBlobContent)
      }

      it('should download map from api if blob container dne', async function () {
        const containerClient = await blob.getContainerClient(pathname)
        await blob.client.deleteContainer(containerClient.containerName)
        await expectAPI()
      })

      it('should download map from api if blob dne', async function () {
        await blob.getContainerClient(pathname)
        await expectAPI()
      })

      it('should download map from blob if blob exists', async function () {
        await blob.createBlob(pathname, trackId.toString(), blobContent())
        await expectBlob()
      })

      it('should remove the map downloaded from blob', async function () {
        await blob.createBlob(pathname, trackId.toString(), blobContent())
        await fetch(`${url}${pathname}/${trackId}`)
        await expectAPI()
      })

      it('should download map from api if blob dne if isbodyblobid', async function () {
        await blob.getContainerClient(pathname)
        await blob.createBlob(pathname, trackId.toString(), blobContent(true))
        await expectAPI()
      })

      it('should download map from separate blob if isbodyblobid', async function () {
        const bc = blobContent(true)
        await blob.createBlob(pathname, trackId.toString(), bc)
        await blob.createBlob(pathname, bc.body, bodyBlobContent)
        await expectBodyBlob()
      })

      it('should remove the map downloaded from blob if isbodyblobid', async function () {
        const bc = blobContent(true)
        await blob.createBlob(pathname, trackId.toString(), bc)
        await blob.createBlob(pathname, bc.body, bodyBlobContent)
        await fetch(`${url}${pathname}/${trackId}`)
        await blob.createBlob(pathname, trackId.toString(), bc)
        await expectAPI()
      })

      it('should download many maps from blob', async function () {
        await blob.createBlob(pathname, '240', blobContent())
        await blob.createBlob(pathname, '241', blobContent())
        await expectBlob(240)
        await expectBlob(241)
        await blob.createBlob(pathname, '242', blobContent())
        await expectBlob(242)
        await blob.createBlob(pathname, '243', blobContent())
        await blob.createBlob(pathname, '244', blobContent(true))
        await blob.createBlob(pathname, blobContent(true).body, bodyBlobContent)
        await blob.createBlob(pathname, '245', blobContent())
        await blob.createBlob(pathname, '246', blobContent())
        await expectBlob(243)
        await expectBodyBlob(244)
        await expectBlob(245)
        await expectBlob(246)
        await expectAPI(247)
        await blob.createBlob(pathname, '247', blobContent())
        await expectBlob(247)
      })
    })

    describe('api/maps/get_map_info/multi/:id', function () {
      it('should return the map info for the id', async function () {
        const response = await fetch(`${url}/mx/api/maps/get_map_info/multi/500`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data).toContainEqual(expect.objectContaining({ TrackID: 500 }))
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
      const expectAPI = async () => {
        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()

        expect(response.status).toBe(200)
        expect(response.headers.get('Cache-Control')).toBe('private')
        expect(data?.results).toContainEqual(expect.objectContaining({ TrackID: 500 }))
      }
      const expectQueue = async (id = trackId) => {
        const response = await fetch(`${url}${pathname}${search}`)
        const data = await response.json()

        expect(response.status).toBe(queueContent().status)
        expect(response.headers.get('Test')).toBe('Header')
        expect(data?.results).toContainEqual(expect.objectContaining({ TrackID: id }))
      }

      it('should return a random map from api if queue dne', async function () {
        const queueClient = await queue.getQueueClient(pathname)
        await queue.client.deleteQueue(queueClient.name)
        await expectAPI()
      })

      it('should return a random map from api if queue is empty', async function () {
        await queue.getQueueClient(pathname)
        await expectAPI()
      })

      it('should return a random map from queue', async function () {
        await queue.createMessage(pathname, queueContent())
        await expectQueue()
      })

      it('should remove the random map returned from queue', async function () {
        await queue.createMessage(pathname, queueContent())
        await fetch(`${url}${pathname}${search}`)
        await expectAPI()
      })

      it('should return many random maps from queue', async function () {
        await queue.createMessage(pathname, queueContent(230))
        await queue.createMessage(pathname, queueContent(231))
        await expectQueue(230)
        await expectQueue(231)
        await queue.createMessage(pathname, queueContent(232))
        await expectQueue(232)
        await queue.createMessage(pathname, queueContent(233))
        await queue.createMessage(pathname, queueContent(234))
        await queue.createMessage(pathname, queueContent(235))
        await queue.createMessage(pathname, queueContent(236))
        await expectQueue(233)
        await expectQueue(234)
        await expectQueue(235)
        await expectQueue(236)
        await expectAPI()
        await queue.createMessage(pathname, queueContent(237))
        await expectQueue(237)
      })
    })
  })

  describe('caches', function () {
    it('should return all the queues and their sizes', async function () {
      await queue.createMessage('/mx/test1', queueContent())
      await queue.createMessage('/mx/test1', queueContent())
      await queue.createMessage('/mx/test1', queueContent())
      await queue.createMessage('/mx/test1', queueContent())
      await queue.createMessage('/mx/test1', queueContent())

      await queue.getQueueClient('/mx/test2')

      await queue.createMessage('/mx/test3', queueContent())
      await queue.createMessage('/mx/test3', queueContent())
      await queue.createMessage('/mx/test3', queueContent())

      const response = await fetch(`${url}/caches`)
      const data = await response.json()

      expect(data.backend.queues).toHaveLength(3)
      expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-test1', size: 5 }))
      expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-test2', size: 0 }))
      expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-test3', size: 3 }))
    })

    it('should return all the containers and their sizes', async function () {
      await blob.createBlob('/mx/maps/download', '601', blobContent())
      await blob.createBlob('/mx/maps/download', '602', blobContent())
      await blob.createBlob('/mx/maps/download', '603', blobContent())

      const response = await fetch(`${url}/caches`)
      const data = await response.json()

      expect(data.backend.containers).toHaveLength(1)
      expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 3 }))
    })

    describe('/caches/rmc', function () {
      const pathname = '/caches/rmc'
      const searchUrl = `/mx/${process.env.CACHE_RMC_SEARCHURL}`
      const downloadUrl = `/mx/${process.env.CACHE_RMC_DOWNLOADURL}`
      const size = parseInt(process.env.CACHE_RMC_SIZE ?? '5')

      describe('get', function () {
        const options = { headers: { 'x-apikey': process.env.APIKEY ?? 'dev-apikey' } }

        it('should preload maps to mapsearch', async function () {
          await fetch(`${url}${pathname}`, options)

          let response = await fetch(`${url}/caches`)
          let data = await response.json()
          expect(data.backend.queues).toHaveLength(1)
          expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-mapsearch2-search', size }))

          response = await fetch(`${url}${searchUrl}`)
          data = await response.json()
          expect(response.status).toBe(200)
          expect(data.results).toContainEqual(expect.objectContaining({ TrackID: 500 }))

          response = await fetch(`${url}/caches`)
          data = await response.json()
          expect(data.backend.queues).toHaveLength(1)
          expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-mapsearch2-search', size: size - 1 }))
        })

        it('should preload maps to map download', async function () {
          await fetch(`${url}${pathname}`, options)

          let response = await fetch(`${url}/caches`)
          let data = await response.json()
          expect(data.backend.containers).toHaveLength(1)
          expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 2 }))

          response = await fetch(`${url}${downloadUrl}/500`)
          data = await response.text()
          expect(response.status).toBe(200)
          expect(data).toBe('map')

          response = await fetch(`${url}/caches`)
          data = await response.json()
          expect(data.backend.containers).toHaveLength(1)
          expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 0 }))
        })

        it('should not preload maps to map search if mx map search fails', async function () {
          await fetch(`${url}${pathname}?search=fail/500`, options)

          const response = await fetch(`${url}/caches`)
          const data = await response.json()
          expect(data.backend.queues).toHaveLength(1)
          expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-mapsearch2-search', size: 0 }))
        })

        it('should not preload maps to map search if mx map download fails', async function () {
          await fetch(`${url}${pathname}?download=fail/500`, options)

          const response = await fetch(`${url}/caches`)
          const data = await response.json()
          expect(data.backend.queues).toHaveLength(1)
          expect(data.backend.queues).toContainEqual(expect.objectContaining({ name: 'mx-mapsearch2-search', size: 0 }))
        })

        it('should reject preload if no apikey is specified', async function () {
          const response = await fetch(`${url}${pathname}`)
          expect(response.status).toBe(401)
        })

        it('should reject preload if bad apikey is specified', async function () {
          const response = await fetch(`${url}${pathname}`, { headers: { 'x-apikey': 'bad-apikey' } })
          expect(response.status).toBe(401)
        })
      })

      describe('delete', function () {
        const options = { method: 'DELETE', headers: { 'x-apikey': process.env.APIKEY ?? 'dev-apikey' } }
        const blobPathname = '/mx/maps/download'
        const messageTimeToLive = parseInt(process.env.CACHE_RMC_MESSAGETTL ?? '604800')

        it('should not prune preloaded maps within message time to live', async function () {
          await blob.createBlob(blobPathname, trackId.toString(), blobContent())
          await fetch(`${url}${pathname}`, options)

          const response = await fetch(`${url}/caches`)
          const data = await response.json()
          expect(data.backend.containers).toHaveLength(1)
          expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 1 }))
        })

        it('should not prune preloaded maps within double message time to live', async function () {
          await blob.createBlob(blobPathname, trackId.toString(), blobContent())
          await fetch(`${url}${pathname}?date=${Date.now() + 1000 * messageTimeToLive + 1000}`, options)

          const response = await fetch(`${url}/caches`)
          const data = await response.json()
          expect(data.backend.containers).toHaveLength(1)
          expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 1 }))
        })

        it('should prune preloaded maps that are older than double message time to live', async function () {
          await blob.createBlob(blobPathname, trackId.toString(), blobContent())
          await fetch(`${url}${pathname}?date=${Date.now() + 2 * 1000 * messageTimeToLive + 1000}`, options)

          const response = await fetch(`${url}/caches`)
          const data = await response.json()
          expect(data.backend.containers).toHaveLength(1)
          expect(data.backend.containers).toContainEqual(expect.objectContaining({ name: 'mx-maps-download', size: 0 }))
        })

        it('should reject prune if no apikey is specified', async function () {
          const response = await fetch(`${url}${pathname}`, { method: 'DELETE' })
          expect(response.status).toBe(401)
        })

        it('should reject prune if bad apikey is specified', async function () {
          const response = await fetch(`${url}${pathname}`, { method: 'DELETE', headers: { 'x-apikey': 'bad-apikey' } })
          expect(response.status).toBe(401)
        })
      })
    })
  })
})
