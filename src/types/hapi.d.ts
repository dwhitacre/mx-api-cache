import Queue from '../clients/queue'
import Mx from '../clients/mx'

declare module '@hapi/hapi' {
  interface Server {
    mx(): Mx
    queue(): Queue
  }
}
