const SteamUser = require('steam-user')
const config = require('./config.js')
const fs = require('fs')
const prompt = require('prompt')

const client = new SteamUser()

client.on('loggedOn', function () {
	client.enableTwoFactor((err, response) => {
		console.log('The two-factor authentication secret has been saved to "totp.json". Store it somewhere securely.')
		fs.writeFileSync('totp.json', JSON.stringify(response));

		prompt.message = 'You\'ll be sent an SMS with an activation code'
		prompt.start()
		prompt.get('activationCode', (err, result) => {
			client.finalizeTwoFactor(response.shared_secret, result.activationCode, (err) => {
				if (!err) {
					console.log('Success!')
					client.logOff()
				} else {
					console.log('Error: ', err)
					client.logOff()
				}
			})
		})
	})
})

// client.on('steamGuard', function (domain, callback) {
// 	console.log(`Code sent to your e-mail address on ${domain}`)
// })

client.logOn(config.account)
