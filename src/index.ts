import 'dotenv/config'
import Hapi, { ServerRegisterPluginObject } from '@hapi/hapi'
import { resolve } from 'path'

import routes from './routes'
import Mx from './clients/mx'
import Queue from './clients/queue'

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
      redact: ['req.headers'],
      level: process.env.LOG_LEVEL || 'info',
      logPayload: !!process.env.LOG_PAYLOAD,
      logRouteTags: true,
      mergeHapiLogData: true,
      ignorePaths: ['/health'],
    },
  } as ServerRegisterPluginObject<unknown>)

  await server.register(await import('@hapi/inert'))
  await server.register(await import('@hapi/vision'))
  await server.register({ plugin: await import('@hapi/h2o2'), options: { redirects: 5 } })

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
