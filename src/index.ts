import 'dotenv/config'
import Hapi, { ServerRegisterPluginObject } from '@hapi/hapi'
import { resolve } from 'path'

import routes from './routes'
import Mx from './clients/mx'
import Queue from './clients/queue'
import Blob from './clients/blob'
import { CacheConfig } from './routes/caches'

async function start(): Promise<void> {
  const server = new Hapi.Server({
    host: process.env.HOST || 'localhost',
    port: process.env.PORT || 3001,
    routes: {
      files: {
        relativeTo: resolve(__dirname, '../public'),
      },
    },
  })

  await server.register({
    plugin: await import('hapi-pino'),
    options: {
      redact: ['*.headers', '*.request', '*.response'],
      level: process.env.LOG_LEVEL || 'info',
      logPayload: !!process.env.LOG_PAYLOAD,
      logRouteTags: true,
      mergeHapiLogData: true,
      ignorePaths: ['/health'],
    },
  } as ServerRegisterPluginObject<unknown>)

  await server.register(await import('@hapi/inert'))
  await server.register(await import('@hapi/vision'))

  await server.register({
    plugin: await import('hapi-swagger'),
    options: {
      info: {
        title: 'MX API Cache',
      },
      documentationPage: false,
    },
  })

  const mx = new Mx(server, {
    baseUrl: process.env.MX_BASEURL || 'https://trackmania.exchange',
  })
  server.decorate('server', 'mx', function (): Mx {
    return mx
  })

  if (!process.env.AZURE_STORAGE_CONNSTR) {
    server.logger.error('Missing AZURE_STORAGE_CONNSTR')
    process.exit(1)
  }

  const queue = new Queue(server, {
    connStr: process.env.AZURE_STORAGE_CONNSTR,
  })
  server.decorate('server', 'queue', function (): Queue {
    return queue
  })

  const blob = new Blob(server, {
    connStr: process.env.AZURE_STORAGE_CONNSTR,
  })
  server.decorate('server', 'blob', function (): Blob {
    return blob
  })

  server.decorate('server', 'cacheConfig', function (): CacheConfig {
    return {
      rmc: {
        size: parseInt(process.env.CACHE_RMC_SIZE ?? '100'),
        schedule: process.env.CACHE_RMC_SCHEDULE ?? '*/10 * * * * *',
        searchUrl: process.env.CACHE_RMC_SEARCHURL ?? 'mapsearch2/search?api=on&random=1&etags=23,37,40&lengthop=1&length=9&vehicles=1&mtype=TM_Race',
        downloadUrl: process.env.CACHE_RMC_DOWNLOADURL ?? 'maps/download',
      },
    }
  })

  await server.register({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugin: (await import('hapi-cron')) as any,
    options: {
      jobs: [
        {
          name: 'caches/rmc',
          time: server.cacheConfig().rmc.schedule,
          timezone: 'Europe/London',
          request: {
            method: 'GET',
            url: '/caches/rmc',
          },
          onComplete: (response: Response) => {
            server.logger.debug({ response }, 'caches/rmc ran')
          },
        },
      ],
    },
  })

  routes(server)

  process.on('SIGTERM', async function () {
    server.logger.warn('SIGTERM received, shutting down.')
    await server.stop()
    server.logger.warn('Server shutdown. Exiting..')
    process.exit(0)
  })

  await server.start()
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
