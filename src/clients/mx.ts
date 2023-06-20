import { Server } from '@hapi/hapi'
import Wreck from '@hapi/wreck'

export default class Mx {
  readonly server: Server
  readonly baseUrl: string
  readonly client: typeof Wreck

  constructor(server: Server, { baseUrl }: { baseUrl: string }) {
    this.server = server
    this.baseUrl = baseUrl

    this.client = Wreck.defaults({
      baseUrl: this.baseUrl,
    })
  }

  async call(method: string, url: string, options: { [_: string]: unknown }): Promise<JSON | false> {
    let body
    try {
      const response = await this.client.request(method.toUpperCase(), url, options)
      body = await Wreck.read<JSON>(response, {
        json: true,
      })
    } catch (err) {
      this.server.logger.error(err)
      return false
    }
    return body
  }

  // async botPost(text: string, pictureUrl?: string): Promise<boolean> {
  //   this.server.logger.debug({ msg: 'groupme.botPost sending message', text, pictureUrl })

  //   const response = await this.callApi('post', 'bots/post', {
  //     payload: {},
  //   })

  //   if (response && response.meta && response.meta >= 400) {
  //     this.server.logger.error({ msg: 'groupme.botPost failed to post', response })
  //     return false
  //   }

  //   return !!response
  // }
}
