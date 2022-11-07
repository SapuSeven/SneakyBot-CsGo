const SteamUser = require('steam-user')
const config = require('./config.js')

const client = new SteamUser()

client.on('loggedOn', function () {
	client.logOff()
})

client.logOn(config.account)
