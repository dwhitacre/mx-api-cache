import { Request, Server } from '@hapi/hapi'
import pack from '../../package.json'

export default function register(server: Server): void {
  server.route({
    method: 'GET',
    path: '/mx/{param*}',
    options: {
      handler: {
        proxy: {
          mapUri: function (request: Request) {
            return {
              uri: `${server.mx().baseUrl}/${request.params.param}${request.url.search}`,
              headers: {
                'User-Agent': request.headers['user-agent'] ?? `${pack.name}:${pack.version}`,
              },
            }
          },
          onResponse: function (_: Error, res: Response) {
            return res
          },
        },
      },
      description: 'Proxy to the mx api.',
      notes: 'GET proxy to the mx api.',
      tags: ['api', 'mx'],
    },
  })
}
