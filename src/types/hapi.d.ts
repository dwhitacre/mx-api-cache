import Mx from '../clients/mx'

declare module '@hapi/hapi' {
  interface Server {
    mx(): Mx
  }
}
