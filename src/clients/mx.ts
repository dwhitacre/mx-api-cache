import { Server } from '@hapi/hapi'
import Wreck from '@hapi/wreck'
import pack from '../../package.json'

export interface Search {
  [_: string]: unknown
  results?: Array<{
    [_: string]: unknown
    TrackID?: number
  }>
}

export default class Mx {
  readonly server: Server
  readonly baseUrl: string
  readonly client: typeof Wreck

  constructor(server: Server, { baseUrl }: { baseUrl: string }) {
    this.server = server
    this.baseUrl = baseUrl

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

  async mapSearch(searchUrl: string, options = {}) {
    try {
      const response = await this.call('get', searchUrl, options)
      if (!response) throw new Error('failed to map search')
      const search: Search = await Wreck.read(response, { json: true })

      return { response, search }
    } catch (err) {
      this.server.logger.error(err, 'failed to preload map')
      return false
    }
  }

  async mapDownload(downloadUrl: string, trackId: string, options = {}) {
    try {
      const response = await this.call('get', `${downloadUrl}/${trackId}`, options)
      if (!response) throw new Error('failed to map download')
      return { response }
    } catch (err) {
      this.server.logger.error(err, 'failed to preload map')
      return false
    }
  }
}
