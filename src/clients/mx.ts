import { Server } from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import pack from '../../package.json'

export interface Search {
  [_: string]: unknown
  results: Array<{
    [_: string]: unknown
    TrackID: string
  }>
}

export default class Mx {
  readonly server: Server
  readonly baseUrl: string
  readonly preloadRmcSize: number
  readonly client: typeof Wreck

  readonly searchUrl = 'mapsearch2/search?api=on&random=1&etags=23,37,40&lengthop=1&length=9&vehicles=1&mtype=TM_Race'
  readonly downloadUrl = 'maps/download'

  constructor(server: Server, { baseUrl, preloadRmcSize }: { baseUrl: string; preloadRmcSize: string }) {
    this.server = server
    this.baseUrl = baseUrl
    this.preloadRmcSize = parseInt(preloadRmcSize ?? 0)

    this.client = Wreck.defaults({
      baseUrl: this.baseUrl,
      headers: {
        'User-Agent': `${pack.name}:${pack.version}`,
      },
    })
  }

  async call(method: string, url: string, options: { [_: string]: unknown }) {
    try {
      return this.client.request(method.toUpperCase(), url, options)
    } catch (err) {
      this.server.logger.error(err)
      return false
    }
  }

  async preloadRmc() {
    try {
      const searchResponse = await this.call('get', this.searchUrl, {})
      if (!searchResponse) throw new Error('failed to map search')
      const searchBody: Search = await Wreck.read(searchResponse, { json: true })

      return { searchResponse, searchBody }
    } catch (err) {
      this.server.logger.error(err, 'failed to preload map')
      return false
    }
  }
}
