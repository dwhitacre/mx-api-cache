import { Server } from '@hapi/hapi'

import health from './health'
import home from './home'
import mx from './mx'

export default function register(server: Server): void {
  health(server)
  mx(server)
  home(server)
}
