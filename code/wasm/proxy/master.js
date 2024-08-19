var dgram = require('dgram')
var http = require('http')
var url = require('url')
var WebSocketClient = require('ws')
var WebSocketServer = require('ws').Server

var connections = []
var clients = []
var servers = {}
var pruneInterval = 350 * 1000

function formatOOB(data) {
	var str = '\xff\xff\xff\xff' + data + '\x00'

	var buffer = new ArrayBuffer(str.length)
	var view = new Uint8Array(buffer)

	for (var i = 0; i < str.length; i++) {
		view[i] = str.charCodeAt(i)
	}

	return buffer
}

function stripOOB(buffer) {
	var view = new DataView(buffer)

	if (view.getInt32(0) !== -1) {
		return null
	}

	var str = ''
	for (var i = 4 /* ignore leading -1 */; i < buffer.byteLength - 1 /* ignore trailing \0 */; i++) {
		var c = String.fromCharCode(view.getUint8(i))
		str += c
	}

	return str
}

function parseInfoString(str) {
	var data = {}

	var split = str.split('\\')
	// throw when split.length isn't even?

	for (var i = 0; i < split.length - 1; i += 2) {
		var key = split[i]
		var value = split[i+1]
		data[key] = value
	}
}

/**********************************************************
 *
 * messages
 *
 **********************************************************/
var CHALLENGE_MIN_LENGTH = 9
var CHALLENGE_MAX_LENGTH = 12

function buildChallenge() {
	var challenge = ''
	var length = CHALLENGE_MIN_LENGTH - 1 +
		parseInt(Math.random() * (CHALLENGE_MAX_LENGTH - CHALLENGE_MIN_LENGTH + 1), 10)

	for (var i = 0; i < length; i++) {
		var c
		do {
			c = Math.floor(Math.random() * (126 - 33 + 1) + 33); // -> 33 ... 126 (inclusive)
		} while (c === '\\'.charCodeAt(0) || c === ';'.charCodeAt(0) || c === '"'.charCodeAt(0) || c === '%'.charCodeAt(0) || c === '/'.charCodeAt(0))

		challenge += String.fromCharCode(c)
	}

	return challenge
}

function handleGetServers(conn, data) {
	console.log(conn.addr + ':' + conn.port + ' ---> getservers')

	sendGetServersResponse(conn, servers)
}

function handleHeartbeat(conn, data) {
	console.log(conn.addr + ':' + conn.port + ' ---> heartbeat')

	sendGetInfo(conn)
}

function handleInfoResponse(conn, data) {
	console.log(conn.addr + ':' + conn.port + ' ---> infoResponse')

	var info = parseInfoString(data)

	// TODO validate data

	updateServer(conn.addr, conn.port)
}

function sendGetInfo(conn) {
	var challenge = buildChallenge()

	console.log(conn.addr + ':' + conn.port + ' <--- getinfo with challenge \"' + challenge + '\"')

	var buffer = formatOOB('getinfo ' + challenge)
	conn.socket.send(buffer, { binary: true })
}

function sendGetServersResponse(conn, servers) {
	var msg = 'getserversResponse'
	for (var id in servers) {
		if (!servers.hasOwnProperty(id)) {
			continue
		}
		var server = servers[id]
		var octets = server.addr.split('.').map(function (n) {
			return parseInt(n, 10)
		})
		msg += '\\'
		msg += String.fromCharCode(octets[0] & 0xff)
		msg += String.fromCharCode(octets[1] & 0xff)
		msg += String.fromCharCode(octets[2] & 0xff)
		msg += String.fromCharCode(octets[3] & 0xff)
		//msg += String.fromCharCode((server.port & 0xff00) >> 8)
		//msg += String.fromCharCode((server.port & 0xff))
		msg += String.fromCharCode((server.port & 0xff00) >> 8)
		msg += String.fromCharCode((server.port & 0xff))
	}
	msg += '\\EOT'

	console.log(conn.addr + ':' + conn.port + ' <--- getserversResponse with ' + Object.keys(servers).length + ' server(s)')

	var buffer = formatOOB(msg)
	conn.socket.send(buffer, { binary: true })
}

/**********************************************************
 *
 * servers
 *
 **********************************************************/
function serverid(addr, port) {
	return addr + ':' + port
}

function updateServer(addr, port) {
	var id = serverid(addr, port)
	var server = servers[id]
	if (!server) {
		server = servers[id] = { addr: addr, port: port }
	}
	server.lastUpdate = Date.now()

if(port == 14445) {
	debugger
}

	// send partial update to all clients
	for (var i = 0; i < clients.length; i++) {
		sendGetServersResponse(clients[i], { id: server })
	}
}

function removeServer(id) {
	var server = servers[id]

	delete servers[id]

	console.log(server.addr + ':' + server.port + ' timed out, ' + Object.keys(servers).length + ' server(s) currently registered')
}

function pruneServers() {
	var now = Date.now()

	for (var id in servers) {
		if (!servers.hasOwnProperty(id)) {
			continue
		}

		var server = servers[id]
		var delta = now - server.lastUpdate

		if (delta > pruneInterval) {
			removeServer(id)
		}
	}
}

/**********************************************************
 *
 * clients
 *
 **********************************************************/
function handleSubscribe(conn) {
	addClient(conn)

	// send all servers upon subscribing
	sendGetServersResponse(conn, servers)
}

function addClient(conn) {
	var idx = clients.indexOf(conn)

	if (idx !== -1) {
		return;  // already subscribed
	}

	console.log(conn.addr + ':' + conn.port + ' ---> subscribe')

	clients.push(conn)
}

function removeClient(conn) {
	var idx = clients.indexOf(conn)
	if (idx === -1) {
		return;  // conn may have belonged to a server
	}

	var conn = clients[idx]
	delete connections[conn.addr+':'+conn.port]

	console.log(conn.addr + ':' + conn.port + ' ---> unsubscribe')

	clients.splice(idx, 1)
}

/**********************************************************
 *
 * main
 *
 **********************************************************/
function getRemoteAddress(ws) {
	// by default, check the underlying socket's remote address
	var address = ws._socket.remoteAddress

	// if this is an x-forwarded-for header (meaning the request
	// has been proxied), use it
	if (ws.upgradeReq && ws.upgradeReq.headers['x-forwarded-for']) {
		address = ws.upgradeReq.headers['x-forwarded-for']
	}

	return address
}

function getRemotePort(ws, req) {
	var port = ws._socket.remotePort

	if (ws.upgradeReq && ws.upgradeReq.headers['x-forwarded-port']) {
		port = ws.upgradeReq.headers['x-forwarded-port']
	}
	
	if(req.headers && req.headers['x-forwarded-port']) {
		port = req.headers['x-forwarded-port']
	}

	return port
}

function connection(ws, req) {
	this.socket = ws
	this.addr = getRemoteAddress(ws, req)
	this.port = getRemotePort(ws, req)
}

function onMessage(conn, buffer) {
	// node Buffer to ArrayBuffer
	var view = Uint8Array.from(buffer)
	var buffer = view.buffer

	// check to see if this is emscripten's port identifier message
	if (view.byteLength === 10 &&
			view[0] === 255 && view[1] === 255 && view[2] === 255 && view[3] === 255 &&
			view[4] === 'p'.charCodeAt(0) && view[5] === 'o'.charCodeAt(0) && view[6] === 'r'.charCodeAt(0) && view[7] === 't'.charCodeAt(0)) {
			conn.port = ((view[8] << 8) | view[9])
			return
	}

	var msg = stripOOB(buffer)
	if (!msg) {
		removeClient(conn)
		return
	}

	if (msg.indexOf('getservers ') === 0) {
		handleGetServers(conn, msg.substr(11))
	} else if (msg.indexOf('heartbeat ') === 0) {
		handleHeartbeat(conn, msg.substr(10))
	} else if (msg.indexOf('infoResponse\n') === 0) {
		handleInfoResponse(conn, msg.substr(13))
	} else if (msg.indexOf('subscribe') === 0) {
		handleSubscribe(conn)
	} else {
		console.error('unexpected message "' + msg + '"')
	}
}

async function startMasterServer(port) {
	var server = http.createServer()

	var wss = new WebSocketServer({
		server: server
	})

	wss.on('connection', function (ws, req) {
		var conn = new connection(ws, req)
		if(typeof connections[conn.addr+':'+conn.port] == 'undefined')
			connections[conn.addr+':'+conn.port] = conn
		else
			conn = connections[conn.addr+':'+conn.port]

		ws.on('message', function(buffer, flags) {
			onMessage(conn, buffer)
		})

		ws.on('error', function (err) {
			removeClient(conn)
		})

		ws.on('close', function () {
			removeClient(conn)
		})
	})

	// listen only on 0.0.0.0 to force ipv4
  server.listen(port, '0.0.0.0',  function() {
    console.log('Tcp Master running at tcp://0.0.0.0: ' + server.address().port)
  })

	const listener = dgram.createSocket('udp4')
	await new Promise((resolve, reject) => listener
		.on('listening', function() {
			console.log('Udp Master running at udp://0.0.0.0: ' + server.address().port)
			resolve()
		})
		.on('close', () => {
			
		})
		.on('error', reject)
		.on('message', function (message, rinfo) {
			let conn = new connection({
				send: function (message) {
					let data = new Uint8Array(message)
					listener.send(data, 0, data.length, conn.socket._socket.remotePort, conn.socket._socket.remoteAddress);
				},
				_socket: {
					remoteAddress: rinfo.address,
					remotePort: rinfo.port
				}
			}, {})
			if(typeof connections[conn.addr+':'+conn.port] == 'undefined')
				connections[conn.addr+':'+conn.port] = conn
			else
				conn = connections[conn.addr+':'+conn.port]
			
			onMessage(conn, message)
		})
		.bind(port, '0.0.0.0'))

	setInterval(pruneServers, pruneInterval)
}

(async function main() {
	var port = parseInt(process.argv[2])
	if(isNaN(port))
		port = 27950
	if(process.argv[1].match(/\/master\.js$/ig))
		await startMasterServer(port)
})()

module.exports = startMasterServer
