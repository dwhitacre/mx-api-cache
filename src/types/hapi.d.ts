import Blob from '../clients/blob'
import Queue from '../clients/queue'
import Mx from '../clients/mx'
import { CacheConfig } from '../routes/caches'

declare module '@hapi/hapi' {
  interface Server {
    mx(): Mx
    queue(): Queue
    blob(): Blob
    cacheConfig(): CacheConfig
  }
}
