const SteamUser = require('steam-user')
const GlobalOffensive = require('globaloffensive')
const SteamID = require('steamid')
const EChatEntryType = require('steam-user/enums/EChatEntryType')

const log = require('./log.js')
const config = require('./config.js')
const EFriendRelationship = require('steam-user/enums/EFriendRelationship')
const SteamTotp = require('steam-totp')
const fs = require('fs')

const user = new SteamUser()
const csgo = new GlobalOffensive(user)

let friendProfiles = {}

function limiter(fn, wait) {
	let isCalled = false,
		calls = []

	let caller = function () {
		if (calls.length && !isCalled) {
			isCalled = true
			calls.shift().call()
			setTimeout(function () {
				isCalled = false
				caller()
			}, wait)
		}
	}

	return function () {
		calls.push(fn.bind(this, ...arguments))
		caller()
	}
}

function loadProfileUnlimited(sid) {
	log('INFO', 'Loading CS:GO profile for user ' + sid)
	csgo.requestPlayersProfile(sid)
}

const loadProfile = limiter(sid => {
	loadProfileUnlimited(sid)
}, 1000)

function loadFriendProfiles() {
	Object.keys(user.myFriends).forEach((sid) => {
		loadProfile(sid)
	})

	const timeout = 1000 * Object.keys(user.myFriends).length + Number(config.refreshInterval)
	log('INFO', 'Next reload scheduled in ' + timeout + 'ms')
	setTimeout(() => {
		loadFriendProfiles()
	}, timeout)
}

async function steamMessage(steamId, message) {
	await user.chat.sendFriendMessage(steamId, message, {chatEntryType: EChatEntryType.ChatMsg})
}

function steamFriendSearch(name) {
	const friends = Object.entries(user.myFriends)
		.filter(e => e[1] === EFriendRelationship.Friend) // Only actual friends
		.reduce((result, item) => { // Map SteamID to username
			result[item[0]] = user.users[item[0]].player_name
			return result
		}, {})

	for (const e of Object.entries(friends)) {
		if (e.indexOf(name) !== -1)
			return e[0]
	}
}

user.on('loggedOn', function () {
	log('INFO', 'Login successful. SteamID: ' + user.steamID)
	log('INFO', 'Use code ' + user.steamID.accountid + ' to add the bot as a friend')
	user.setPersona(SteamUser.EPersonaState.Online)
	// For new accounts, implement and use requestFreeLicense to request a free CS:GO license
	user.gamesPlayed(730, true)
})

user.on('steamGuard', function(domain, callback, lastCodeWrong) {
	if (lastCodeWrong) {
		log('ERROR', '2FA code invalid')
		user.logOff()
	}

	SteamTotp.getTimeOffset((error, offset) => {
		const totp = JSON.parse(fs.readFileSync('totp.json'))
		const code = SteamTotp.getAuthCode(totp.shared_secret, offset)
		callback(code)
	})
})

user.on('error', function (e) {
	// Some error occurred during logon
	log('ERROR', e)
})

user.on('webSession', function () {
	log('STATUS', 'Got web session')
	// Do something with these cookies if you wish
})

user.on('newItems', function (count) {
	log('STATUS', count + ' new items in inventory')
})

user.on('emailInfo', function (address, validated) {
	log('STATUS', 'E-Mail address: ' + address + ' ' + (validated ? '(validated)' : '(not validated)'))
})

user.on('wallet', function (hasWallet, currency, balance) {
	log('STATUS', 'Wallet balance: ' + SteamUser.formatCurrency(balance, currency))
})

user.on('accountLimitations', function (limited, communityBanned, locked, canInviteFriends) {
	var limitations = []

	if (limited) {
		limitations.push('LIMITED')
	}

	if (communityBanned) {
		limitations.push('COMMUNITY BANNED')
	}

	if (locked) {
		limitations.push('LOCKED')
	}

	if (limitations.length === 0) {
		log('STATUS', 'Account has no limitations.')
	} else {
		log('STATUS', 'Account is ' + limitations.join(', ') + '.')
	}

	if (canInviteFriends) {
		log('STATUS', 'Account can invite friends.')
	}
})

user.on('vacBans', function (numBans, appids) {
	log('STATUS', 'VAC ban' + (numBans === 1 ? '' : 's') + ': ' + numBans)
	if (appids.length > 0) {
		log('STATUS', 'VAC banned from apps: ' + appids.join(', '))
	}
})

user.on('licenses', function (licenses) {
	log('STATUS', 'Account owns ' + licenses.length + ' license' + (licenses.length === 1 ? '' : 's') + '.')
})

user.on('friendRelationship', function (sid, relationship) {
	log('STATUS', 'Relationship of ' + sid + ' changed to ' + SteamUser.EFriendRelationship[relationship])

	if (relationship === SteamUser.EFriendRelationship.RequestRecipient) {
		user.addFriend(sid, function (err, personaName) {
			if (err)
				log('WARN', 'Error adding friend: ' + err)
			else
				log('INFO', 'Successfully added friend: ' + personaName)
		})
	}
})

user.on('friendsList', function () {
	log('STATUS', 'Friend list: ' + Object.keys(user.myFriends).map(sid => sid + ' (' + SteamUser.EFriendRelationship[user.myFriends[sid]] + ')').join(', '))
})

csgo.on('connectedToGC', function () {
	log('STATUS', 'Connected to GC')

	loadFriendProfiles()
})

csgo.on('disconnectedFromGC', function (reason) {
	log('STATUS', 'Disconnected from GC, reason: ' + reason)
})

csgo.on('connectionStatus', function (status, data) {
	log('STATUS', 'GC status changed to ' + status + ':')
	log('STATUS', data)
})

csgo.on('playersProfile', (profile) => {
	const sid = SteamID.fromIndividualAccountID(profile.account_id).getSteamID64()
	log('INFO', 'User ' + sid + ' is level ' + profile.player_level + ' and has rank ' + profile.ranking.rank_id + ', profile data:')
	if (process.argv.includes('-v'))
		console.log(profile)
	friendProfiles[sid] = profile.ranking.rank_id
	log('INFO', 'New friend profile data:')
	console.log(friendProfiles)
})

module.exports = {
	start: () => {
		log('INFO', 'Logging in')

		user.logOn(config.account)
	},
	steamMessage,
	steamFriendSearch,

	ranks: friendProfiles,
}
