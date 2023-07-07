import { Request, Server } from '@hapi/hapi'
import { badGateway, badImplementation } from '@hapi/boom'
import { QueueMeta } from '../clients/queue'
import { ContainerMeta } from '../clients/blob'

export interface Backend {
  queues: Array<QueueMeta>
  containers: Array<ContainerMeta>
}

export interface Caches {
  backend: Backend
  rmc: RMCConfig
}

export interface RMCConfig {
  size: number
  schedule: string
  searchUrl: string
  downloadUrl: string
}

export interface CacheConfig {
  rmc: RMCConfig
}

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/caches',
    options: {
      handler: async function (request: Request) {
        const caches: Caches = {
          backend: { queues: [], containers: [] },
          rmc: { ...server.cacheConfig().rmc },
        }

        try {
          caches.backend.queues = await server.queue().list()
          caches.backend.containers = await server.blob().list()

          request.logger.debug({ caches }, 'caches')
          return caches
        } catch (err) {
          request.logger.error(err, 'failed to connect to backend')
          return badGateway('failed to connect to backend')
        }
      },
      description: 'Get all the current caches',
      notes: 'GET all the current caches and their sizes',
      tags: ['api', 'caches'],
    },
  })

  server.route({
    method: 'GET',
    path: '/caches/rmc',
    options: {
      handler: async function (request: Request) {
        try {
          const { size, searchUrl, downloadUrl } = server.cacheConfig().rmc
          const queuePathname = `mx/${searchUrl}`
          const blobPathname = `mx/${downloadUrl}`

          const queueClient = await server.queue().getQueueClient(queuePathname)
          const properties = await queueClient.getProperties()
          let currentSize = properties.approximateMessagesCount ?? 0

          const searchOptions = request.query.search?.length ? { headers: { 'User-Agent': request.query.search } } : {}
          const downloadOptions = request.query.download?.length ? { headers: { 'User-Agent': request.query.download } } : {}

          while (currentSize < size) {
            const preload = await request.server.mx().mapSearch(searchUrl, searchOptions)
            if (!preload) throw new Error('failed to preload')
            if (preload.response.statusCode != 200) throw new Error('failed to get successful api call in preload')

            const track = preload.search.results?.[0]
            if (!track) throw new Error('failed to find track in preload')

            const trackId = track.TrackID?.toString()
            if (!trackId) throw new Error('failed to find track id in track in preload')

            await server.queue().createMessage(queuePathname, {
              body: JSON.stringify(preload.search),
              status: preload.response.statusCode,
              headers: preload.response.headers as Record<string, string>,
            })

            const preloadDownload = await request.server.mx().mapDownload(downloadUrl, trackId, downloadOptions)
            if (!preloadDownload) throw new Error('failed to download map in preload')
            if (preloadDownload.response.statusCode != 200) throw new Error('failed to get successful download api call in preload')

            const mapBlobId = `${trackId}_map`
            await server.blob().createBlob(blobPathname, trackId, {
              body: mapBlobId,
              status: preloadDownload.response.statusCode,
              headers: preloadDownload.response.headers as Record<string, string>,
              isBodyBlobId: true,
            })
            await server.blob().createBlob(blobPathname, mapBlobId, preloadDownload.response)

            currentSize = (await queueClient.getProperties()).approximateMessagesCount ?? currentSize + 1
          }

          return { status: 'ok', msg: 'preloaded rmc' }
        } catch (err) {
          request.logger.error(err, 'failed to preload rmc')
          return badImplementation('failed to preload rmc')
        }
      },
      description: 'Preload the mx cache',
      notes: 'GET preload the mx cache',
      tags: ['api', 'caches'],
    },
  })
}
