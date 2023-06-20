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
                'User-Agent': `${pack.name}:${pack.version}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
            }
          },
        },
      },
      description: 'Proxy to the mx api.',
      notes: 'GET proxy to the mx api.',
      tags: ['api', 'mx'],
    },
  })
}
