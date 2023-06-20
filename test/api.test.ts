import 'dotenv/config'

const url = `http://${process.env.HOST}:${process.env.PORT}`

describe('api', function () {
  describe('/health', function () {
    it('should respond status ok', async function () {
      const response = await fetch(`${url}/health`)
      const data = await response.json()
      expect(response.status).toBe(200)
      expect(data.status).toBe('ok')
    })
  })

  describe('/*', function () {
    it('should return the home page', async function () {
      const response = await fetch(`${url}`)
      const data = await response.text()
      expect(response.status).toBe(200)
      expect(data).toContain('<!DOCTYPE html>')
    })
  })

  describe('/mx/*', function () {
    const id = 500

    describe('maps/download/:id', function () {
      it('should return the map file', async function () {
        const response = await fetch(`${url}/mx/maps/download/${id}`)
        const data = await response.text()
        expect(response.status).toBe(200)
        expect(data).toBe('map')
      })
    })

    describe('api/maps/get_map_info/multi/:id', function () {
      it('should return the map info for the id', async function () {
        const response = await fetch(`${url}/mx/api/maps/get_map_info/multi/${id}`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data).toContainEqual(expect.objectContaining({ TrackID: id }))
      })
    })

    describe('api/tags/gettags', function () {
      it('should return the tags', async function () {
        const response = await fetch(`${url}/mx/api/tags/gettags`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data).toContainEqual(
          expect.objectContaining({
            ID: 2,
            Name: 'FullSpeed',
          }),
        )
      })
    })

    describe('mapsearch2/search', function () {
      it('should return a random map', async function () {
        const response = await fetch(`${url}/mx/mapsearch2/search?api=on&random=1&etags=23,37,40&lengthop=1&length=9&vehicles=1&mtype=TM_Race`)
        const data = await response.json()
        expect(response.status).toBe(200)
        expect(data.results).toContainEqual(expect.objectContaining({ TrackID: id }))
      })
    })
  })
})
