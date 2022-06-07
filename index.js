const csgo = require('./csgo.js')
const express = require('express')
const bodyParser = require('body-parser')

const port = 7300

const app = express()
app.use(bodyParser.text({type: 'text/plain'}))

app.get('/ranks', (req, res) => {
	res.send(csgo.ranks)
})

app.post('/steam/message/:id', async (req, res) => {
	await csgo.steamMessage(req.params.id, req.body)
	res.sendStatus(200)
})

app.get('/steam/search/:name', async (req, res) => {
	const result = csgo.steamFriendSearch(req.params.name)
	if (result)
		res.send(result)
	else
		res.sendStatus(404)
})

app.listen(port, (err) => {
	if (err)
		return console.log('An error occurred:', err)

	console.log('Server is listening on port ' + port)

	csgo.start()
})
