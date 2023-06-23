import { Server } from '@hapi/hapi'

import caches from './caches'
import health from './health'
import home from './home'
import mx from './mx'

export default function register(server: Server): void {
  caches(server)
  health(server)
  mx(server)
  home(server)
}
