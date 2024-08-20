const MAX_MSGLEN = 16384


function reverseLookup(ipSlice) {
  let reverseLookup = Object.keys(NET.lookup).filter(function (addr) {
    if (NET.lookup[addr][0] == ipSlice[0]
      && NET.lookup[addr][1] == ipSlice[1]
      && NET.lookup[addr][2] == ipSlice[2]
      && NET.lookup[addr][3] == ipSlice[3]) {
      return true
    }
    return false
  })
  if (reverseLookup.length) {
    return reverseLookup[0]
  }
  return null
}

function NET_AdrToString(net) {
  if (HEAPU32[net >> 2] == 2) {
    return stringToAddress('localhost')
  } else
    if (HEAPU32[net >> 2] == 4) {
      let lookup = reverseLookup(HEAPU8.slice(net + 4, net + 8))
      if (lookup)
        return stringToAddress(lookup)
      return stringToAddress(
        HEAPU8[net + 4] + '.'
        + HEAPU8[net + 5] + '.'
        + HEAPU8[net + 6] + '.'
        + HEAPU8[net + 7])
    }
}

function Sys_SockaddrToString() {
  // DNS doesn't work in the browser, but UDP works with SOCKS
  //   How complicated to add DNS lookup through SOCK?
  debugger
}

function Sys_StringToAdr(addr, net) {
  let addrStr = addressToString(addr)

  //if(addrStr.includes('local.games')) {
  //	debugger
  //}

  if (addrStr.match(/localhost/i)) {
    HEAPU32[net >> 2] = 2 /* NA_LOOPBACK */
    NET.lookup[addrStr] = [127, 0, 0, 1]
  } else

    if (typeof NET.lookup[addrStr] == 'undefined') {
      if (NET.lookupCount1 == 256) {
        NET.lookupCount2++;
        NET.lookupCount1 = 1;
      } else {
        NET.lookupCount1++;
      }
      HEAPU32[net >> 2] = 4 /* NA_IP */
      let ip = addrStr.match(/^([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)$/)
      if (ip) {
        NET.lookup[addrStr] = [
          parseInt(ip[1]), parseInt(ip[2]),
          parseInt(ip[3]), parseInt(ip[4]),
        ]
      } else {
        NET.lookup[addrStr] = [10, 0, NET.lookupCount2, NET.lookupCount1]
      }
    } else {
      HEAPU32[net >> 2] = 4 /* NA_IP */
    }
  HEAPU8[net + 4] = NET.lookup[addrStr][0];
  HEAPU8[net + 5] = NET.lookup[addrStr][1];
  HEAPU8[net + 6] = NET.lookup[addrStr][2];
  HEAPU8[net + 7] = NET.lookup[addrStr][3];
  return true
}

function Sys_StringToSockaddr() {

}

function Sys_SendPacket(length, data, to) {
  let nameStr = addressToString(to + 10)
    || reverseLookup(HEAPU8.slice(to + 4, to + 8))
  if (nameStr && nameStr.includes('ws://')) {
    nameStr = nameStr.replace('ws://', '')
      .replace(/\:[0-9]+$/, '')
  }
  let fullMessage = new Uint8Array(
    4 + (nameStr ? (nameStr.length + 2) : 4)
    + 2 + length)
  fullMessage[0] = 0x00 // 0x05
  fullMessage[1] = 0x00 // 0x01
  fullMessage[2] = 0x00 // reserved
  if (nameStr) {
    fullMessage[3] = 0x03
    fullMessage[4] = nameStr.length + 1
    fullMessage.set(nameStr.split('').map(c => c.charCodeAt(0)), 5)
    fullMessage[5 + nameStr.length + 1] = HEAPU8[to + 8]
    fullMessage[5 + nameStr.length + 2] = HEAPU8[to + 9]
  } else {
    fullMessage[3] = 0x01
    fullMessage[4] = HEAPU8[to + 4]
    fullMessage[5] = HEAPU8[to + 5]
    fullMessage[6] = HEAPU8[to + 6]
    fullMessage[7] = HEAPU8[to + 7]
    fullMessage[8] = HEAPU8[to + 8]
    fullMessage[9] = HEAPU8[to + 9]
  }
  fullMessage.set(HEAPU8.slice(data, data + length), fullMessage.length - length);
  if (!NET.socket1 || NET.socket1.readyState != WebSocket.OPEN) {
    //NET.socket1Queue.push(fullMessage)
    //NET.socket2Queue.push(fullMessage)
  }
  if (NET.socket1 && NET.socket1.readyState == WebSocket.OPEN
    && NET.socket1.fresh >= 3) {
    NET.socket1.send(fullMessage)
  } else
    if (NET.socket2 && NET.socket2.readyState == WebSocket.OPEN
      && NET.socket2.fresh >= 3) {
      NET.socket2.send(fullMessage)
    }
}


function NET_Sleep() {
  let sv_running = Cvar_VariableIntegerValue(stringToAddress('sv_running'))
  let sv_dedicated = Cvar_VariableIntegerValue(stringToAddress('dedicated'))
  if (!NET.queue || !NET.buffer) {
    return
  }
  let count = NET.queue.length
  // alternate buffers so we don't overwrite
  for (let i = 0; i < count; i++) {
    let packet = NET.queue.shift()
    if (!packet) {
      break
    }
    NET.bufferAlternate = NET.bufferAlternate ? 0 : 1
    let buffer = NET.buffer + NET.bufferAlternate * NET.bufferLength * 2
    let from = buffer
    let netmsg = buffer + 512
    let data = buffer + 1024
    HEAPU8.set(packet[2], data)
    MSG_Init(netmsg, data, MAX_MSGLEN)
    //console.log(packet[2].length, packet)
    HEAPU8.fill(0, from, from + 512)
    //HEAPU8.fill(0, netmsg, netmsg + 512)
    //HEAPU32[(netmsg >> 2) + 3] = data
    //HEAPU32[(netmsg >> 2) + 4] = MAX_MSGLEN
    //HEAPU32[(netmsg >> 2) + 5] = MAX_MSGLEN * 8
    HEAPU32[(netmsg >> 2) + 6] = packet[2].length
    //(packet[2].length && 0xFF000000) >> 24
    //+ (packet[2].length && 0x00FF0000) >> 16 + 
    HEAPU32[from >> 2] = 4 /* NA_IP */
    HEAPU8[from + 8] = packet[1][1]
    HEAPU8[from + 9] = packet[1][0]
    //HEAPU16[(from + 8) >> 1] = (packet[1][0] << 8) + packet[1][1] // port
    if (typeof packet[0] == 'string') {
      Sys_StringToAdr(stringToAddress(packet[0]), from)
    } else {
      HEAPU8.set(packet[0], from + 4)
    }

    try {
      if (sv_running || sv_dedicated)
        Com_RunAndTimeServerPacket(from, netmsg);
      else
        CL_PacketEvent(from, netmsg);
    } catch (up) {
      console.log(Array.from(packet[2]).map(c => String.fromCharCode(c)).join(''))
      throw up
    }
  }
}

function sendHeartbeat(sock) {
  if (sock && sock.readyState == WebSocket.OPEN) {
    if(sock.fresh >= 3) { // don't heartbeat too early
      sock.fresh = 5
      sock.send(Uint8Array.from([0x05, 0x01, 0x00, 0x00]),
        { binary: true })
    }
    return
  } else 
  if (sock && sock.readyState == WebSocket.CLOSED) {
    NET.port_try = 0
    NET.reconnect = true
    if (sock == NET.socket1) {
      NET.socket1 = null
    } else {
      NET.socket2 = null
    }
  }
  try {
    NET_OpenIP()
  } catch (e) {
    // prevent from causing timer to fail
    console.error(e)
  }

}


function sendLegacyEmscriptenConnection(socket, port) {
  socket.send(Uint8Array.from([
    0xFF, 0xFF, 0xFF, 0xFF,
    'p'.charCodeAt(0), 'o'.charCodeAt(0), 'r'.charCodeAt(0), 't'.charCodeAt(0),
    (port & 0xFF00) >> 8, (port & 0xFF)
  ]))

}


function socketOpen(evt) {
  evt.target.fresh = 1
  evt.target.send(Uint8Array.from([
    0x05, 0x01, 0x00, // no password caps?
  ]))
  if (!NET.heartbeat) {
    NET.heartbeat = setInterval(function () {
      sendHeartbeat(NET.socket1)
      NET.heartbeatTimeout = setTimeout(function () {
        sendHeartbeat(NET.socket2)
      }, 7000)
    }, 9000)
  }
  if (!NET.reconnect) return
  sendLegacyEmscriptenConnection(evt.target, NET.net_port)
}


function socketMessage(evt) {
  if (typeof evt.data == 'string') {
    if (typeof socketProxyControl != 'undefined') {
      return socketProxyControl(evt)
    }
    return
  }
  let message = new Uint8Array(evt.data)
  //console.log(message)
  switch (evt.target.fresh) {
    case 1:
      if (message.length != 2) {
        throw new Error('wtf? this socket no worky')
      } else

        if (message[1] != 0) {
          debugger
          throw new Error('this socket requires a password, dude')
        }

      // send the UDP associate request
      evt.target.send(Uint8Array.from([
        0x05, 0x03, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00, // ip address
        (NET.net_port & 0xFF00) >> 8, (NET.net_port & 0xFF)
      ]))
      evt.target.fresh = 2
      break
    case 2:
      if (message.length == 2 && message[1] == 0x00) {
        return
      }

      if (message.length < 5) {
        throw new Error('denied, can\'t have ports')
      }

      if (message[3] != 1) {
        throw new Error('relay address is not IPV4')
      }

      sendLegacyEmscriptenConnection(evt.target, NET.net_port)
      evt.target.fresh = 3
      //if(evt.target == NET.socket1) {
      //for(let i = 0, count = NET.socket1Queue.length; i < count; i++) {
      //evt.target.send(NET.socket1Queue.shift())
      //}
      //} else {
      //for(let i = 0, count = NET.socket1Queue.length; i < count; i++) {
      //evt.target.send(NET.socket2Queue.shift())
      //}
      //}
      //NET.socket1Queue.splice(0)
      //NET.socket2Queue.splice(0)
      break
    case 3:
      if (message.length == 10) {
        evt.target.fresh = 4
        break
      }

    case 4:
    case 5:
      // add messages to queue for processing
      if (message.length == 2 || message.length == 10) {
        evt.target.fresh = 4
        return
      }

      //if(NET.socket1Queue.length || NET.socket2Queue.length) {
      //  NET.socket1Queue.splice(0)
      //  NET.socket2Queue.splice(0)
      //}

      let addr, remotePort, msg
      if (message[3] == 1) {
        addr = message.slice(4, 8)
        remotePort = message.slice(8, 10)
        msg = Array.from(message.slice(10))
      } else if (message[3] == 3) {
        addr = Array.from(message.slice(5, 5 + message[4])).map(function (c) {
          return String.fromCharCode(c)
        }).join('')
        remotePort = message.slice(5 + message[4], 5 + message[4] + 2)
        msg = Array.from(message.slice(5 + addr.length + 2))
      } else if (message[1] == 1 && ++NET.port_try < 10) {
        // TODO: try a different port
        // TODO: need to implement alternate port configuration from net_ip
        NET.net_port = NET.original_port + NET.port_try
        Cvar_SetIntegerValue(addressToString('net_port'), NET.net_port);
        return socketOpen({ target: evt.target })
      } else {
        throw new Error('don\' know what to do mate')
      }
      //if(addr.includes('local.games')) {
      //	debugger
      //}
      let now = Date.now()
      if (evt.target == NET.socket1 && NET.socket2 && now - NET.socket2.msgTime < 10
        || evt.target == NET.socket2 && NET.socket1 && now - NET.socket1.msgTime < 10) {
      } else {
        evt.target.msgTime = now
        if (typeof Cbuf_AddText != 'undefined') {
          NET.queue.push([addr, remotePort, msg])
        }
      }
      break
  }
}

function socketError(evt) {
  NET.reconnect = true
  if (evt.target == NET.socket1) {
    NET.socket1 = null
  }
  if (evt.target == NET.socket2) {
    NET.socket2 = null
  }
}

function NET_OpenIP() {
  NET.net_port = NET.original_port = 0
  NET.net_socksServer = window.location.hostname
  NET.net_socksPort = window.location.port

  if (typeof Cvar_VariableString != 'undefined') {
    NET.net_port = NET.original_port = addressToString(Cvar_VariableString(stringToAddress('net_port')))
    NET.net_socksServer = addressToString(Cvar_VariableString(stringToAddress('net_socksServer')))
    NET.net_socksPort = addressToString(Cvar_VariableString(stringToAddress('net_socksPort')))
  }

  if (!NET.buffer && typeof malloc != 'undefined') {
    // from NET_Event() + netmsg_t + netadr_t
    NET.bufferLength = MAX_MSGLEN + 8 + 24 + 1024
    NET.bufferAlternate = 0
    NET.buffer = malloc(NET.bufferLength * 4)
  }
  if (!NET.queue) {
    NET.queue = []
  }
  NET.queue.splice(0)
  //NET.socket1Queue.splice(0)
  //NET.socket2Queue.splice(0)

  if (window.location.protocol != 'http:'
    && window.location.protocol != 'https:') {
    return
  }
  let fullAddress = 'ws'
    + (window.location.protocol.length > 5 ? 's' : '')
    + '://' + NET.net_socksServer + ':' + NET.net_socksPort

  /*
      for( i = 0 ; i < 10 ; i++ ) {
      ip_socket = NET_IPSocket( net_ip->string, port + i, &err );
      if (ip_socket != INVALID_SOCKET) {
        Cvar_SetIntegerValue( 'net_port', port + i );

        if (net_socksEnabled->integer)
          NET_OpenSocks( port + i );

        break;
      }
      else
      {
        if(err == EAFNOSUPPORT)
          break;
      }
    }
  */
  try {

    if (!NET.socket1) {
      NET.socket1 = new WebSocket(fullAddress)
      NET.socket1.binaryType = 'arraybuffer';
      NET.socket1.addEventListener('open', socketOpen, false)
      NET.socket1.addEventListener('message', socketMessage, false)
      NET.socket1.addEventListener('error', socketError, false)
    }
    if (!NET.socket2) {
      NET.socket2 = new WebSocket(fullAddress)
      NET.socket2.binaryType = 'arraybuffer';
      NET.socket2.addEventListener('open', socketOpen, false)
      NET.socket2.addEventListener('message', socketMessage, false)
      NET.socket2.addEventListener('error', socketError, false)
    }

  } catch (e) {
    console.error(e)
  }
}

function NET_Shutdown() {
  return
  if (NET.heartbeat) {
    clearInterval(NET.heartbeat)
  }
  if (NET.heartbeatTimeout) {
    clearTimeout(NET.heartbeatTimeout)
  }
  if (NET.socket1) {
    NET.socket1.removeEventListener('open', socketOpen)
    NET.socket1.removeEventListener('message', socketMessage)
    NET.socket1.removeEventListener('close', socketError)
    NET.socket1.close()
    NET.socket1 = null
  }
  if (NET.socket2) {
    NET.socket2.removeEventListener('open', socketOpen)
    NET.socket2.removeEventListener('message', socketMessage)
    NET.socket2.removeEventListener('close', socketError)
    NET.socket2.close()
    NET.socket2 = null
  }
}

function Sys_IsLANAddress() {

}

function Sys_Offline() {

}

function Sys_NET_MulticastLocal(net, length, data) {
  debugger
  // all this does is use a dedicated server in a service worker
  window.serverWorker.postMessage([
    'net', net, Uint8Array.from(ENV.memory.slice(data, data + length))])
}


function responseProgress(total, response) {
  let loaded = 0
  return new Response(
    new ReadableStream({
      start(controller) {
        const reader = response.body.getReader();

        read();
        function read() {
          reader.read().then(({ done, value }) => {
            if (done) {
              controller.close();
              return;
            }
            loaded += value.byteLength;
            if (HEAPU32[com_fullyInitialized >> 2]) {
              Cvar_SetIntegerValue(stringToAddress('cl_downloadCount'), loaded)
            }
            //console.log(Math.round(loaded/total*100)+'%');
            controller.enqueue(value);
            read();
          }).catch(error => {
            controller.error(error)
          })
        }
      }
    }))
}



async function Com_DL_HeaderCallback(localName, response) {
  //let type = response.headers.get('Content-Type')
  if (!response || !(response.status >= 200 && response.status < 300 || response.status === 304)) {
    //Sys_FileReady(stringToAddress(localName), null) // failed state, not to retry
    //throw new Error('Couldn\'t load ' + response.url + '. Status: ' + (response || {}).statusCode)
    if (response && response.body) {
      response.body.getReader().cancel()
    }
    // TODO: check for too big files!
    //if(controller)
    //controller.abort()
    return
  }
  let totalSize = response.headers.get('content-length')
  if (totalSize) {
    totalSize = parseInt(totalSize, 10)
    if (HEAPU32[com_fullyInitialized >> 2]) {
      Cvar_SetIntegerValue(stringToAddress('cl_downloadSize'), totalSize)
    }
    let progressWrapper = await responseProgress(totalSize, response)
    let result = await progressWrapper.arrayBuffer()
    result.response = response
    return result
  }
  let result = await response.arrayBuffer()
  result.response = response
  return result
}

function Com_DL_Cleanup() {
  if (NET.controller) {
    NET.controller.abort()
    NET.controller = null
  }
}

function Com_DL_Begin(localName, remoteURL) {
  if (AbortController && !NET.controller) {
    NET.controller = new AbortController()
  }
  remoteURL += (remoteURL.includes('?') ? '&' : '?') + 'time=' + NET.cacheBuster
  return fetch(remoteURL, {
    mode: 'cors',
    responseType: 'arraybuffer',
    credentials: 'omit',
    signal: NET.controller ? NET.controller.signal : null
  })
    // why so many? this catches connection errors
    .catch(function (error) {
      console.error(error)
      return
    })
    .then(function (response) {
      return Promise.resolve(Com_DL_HeaderCallback(localName, response))
    })
    // this catches streaming errors, does everybody do this?
    .catch(function (error) {
      console.error(error)
      return
    })
}


function CL_cURL_BeginDownload(localName, remoteURL) {
  Cvar_Set(stringToAddress('cl_downloadName'), localName)
  Cvar_SetIntegerValue(stringToAddress('cl_downloadSize'), 0)
  Cvar_SetIntegerValue(stringToAddress('cl_downloadCount'), 0)
  //Cvar_SetIntegerValue( stringToAddress('cl_downloadTime', cls.realtime );
  localName = addressToString(localName)
  Promise.resolve(Com_DL_Begin(localName, addressToString(remoteURL)))
    .then(responseData => Com_DL_Perform(localName, localName, responseData))
    .then(() => CL_NextDownload())
  return true
}


function Com_DL_Perform(nameStr, localName, responseData) {
  NET.downloadCount--
  if (!responseData) {
    // already responded with null data
    return
  }
  if (localName[0] == '/')
    localName = localName.substring(1)
  // TODO: intercept this information here so we can invalidate the IDBFS storage
  if (localName.includes('version.json')) {
    NET.cacheBuster = Date.parse(JSON.parse(Array.from(new Uint8Array(responseData))
      .map(c => String.fromCharCode(c)).join(''))[0])
  }

  // don't store any index files, redownload every start
  if (nameStr.endsWith('/')) {
    let tempName = nameStr + '.' // yes this is where it always looks for temp files
      + Math.round(Math.random() * 0xFFFFFFFF).toString(16) + '.tmp'
    FS_CreatePath(stringToAddress(nameStr))
    FS.virtual[tempName] = {
      timestamp: new Date(),
      mode: FS_FILE,
      contents: new Uint8Array(responseData)
    }
    //Sys_FileReady(stringToAddress(localName), stringToAddress(tempName));
  } else {
    // TODO: JSON.parse
    // save the file in memory for now
    FS_CreatePath(stringToAddress(nameStr))
    FS.virtual[nameStr] = {
      timestamp: new Date(),
      mode: FS_FILE,
      contents: new Uint8Array(responseData)
    }
    // async to filesystem
    // does it REALLY matter if it makes it? wont it just redownload?
    writeStore(FS.virtual[nameStr], nameStr)
    //Sys_FileReady(stringToAddress(localName), stringToAddress(nameStr));
  }

}

function CL_Download(cmd, name, auto) {
  if (!FS.database) {
    openDatabase()
  }
  //if(NET.downloadCount > 5) {
  //  return 0 // delay like cl_curl does
  //}

  // TODO: make a utility for Cvar stuff?
  let cmdStr = addressToString(cmd)
  let dlURL = addressToString(Cvar_VariableString(stringToAddress('cl_dlURL')))
  let gamedir = addressToString(FS_GetCurrentGameDir())
  let nameStr = addressToString(name)
  let basegame = addressToString(Cvar_VariableString(stringToAddress('fs_basegame')))
  let localName = nameStr
  if (localName[0] == '/')
    localName = localName.substring(1)
  if (localName.startsWith(gamedir + '/'))
    localName = localName.substring(gamedir.length + 1)

  let remoteURL
  if (dlURL.includes('%1')) {
    remoteURL = dlURL.replace('%1', localName.replace(/\//ig, '%2F'))
  } else {
    remoteURL = dlURL + '/' + localName
  }
  if (dlURL.startsWith('//')) {
    remoteURL = window.location.protocol + remoteURL
  } else
    if (dlURL.startsWith('/')) {
      remoteURL = window.location.origin + remoteURL
    } else
      if (!dlURL.includes('://')) {
        remoteURL = window.location.origin + window.location.pathname.replace(/\/*[^\/]*$/gi, '') + '/' + remoteURL
      }
  if (remoteURL.includes('.googleapis.com')) {
    if (nameStr.endsWith('/')) {
      remoteURL = 'https://www.googleapis.com/storage/v1/b/'
        + remoteURL.match(/\/b\/(.*?)\/o\//)[1]
        + '/o/?includeTrailingDelimiter=true&maxResults=100&delimiter=%2f&prefix='
        + remoteURL.match(/\/o\/(.*)/)[1]
    } else if (!remoteURL.includes('?')) {
      remoteURL += '?alt=media'
    }
  }

  var server = addressToString(Cvar_VariableString('cl_currentServerAddress'))
  if(server.length && !window.location.includes(server))
    history.pushState({location: window.location.toString()}, window.title, '?connect ' + server)

  let waitFor = Promise.resolve((async function () {
    try {
      NET.downloadCount++
      let result
      //if (nameStr.includes('version.json') || nameStr.includes('maps/maplist.json')) {
      //} else {
      //  result = await readStore(nameStr)
      //}
      let responseData
      //if (!result || (result.mode >> 12) == ST_DIR
        // bust the caches!
      //  || result.timestamp.getTime() < NET.cacheBuster) {
        responseData = (await Promise.all([
          await Com_DL_Begin(localName, remoteURL),
          await Com_DL_Begin(localName + '.pk3', remoteURL + '.pk3')
            .then(responseData => {
              if(responseData && !nameStr.match(/\.pk3$/)) {
                localName += '.pk3'
              }
              return responseData
            }),
          await Com_DL_Begin(localName + '.bsp', remoteURL + '.bsp')
          .then(responseData => {
            if(responseData && !nameStr.match(/\.bsp$/)) {
              nameStr = 'maps/' + localName + '.bsp'
            }
            return responseData
          }),
          await Com_DL_Begin(localName + '.bsp', basegame + '/pak0.pk3dir/maps/' + localName + '.bsp')
          .then(responseData => {
            if(responseData && !nameStr.match(/\.bsp$/)) {
              nameStr = 'maps/' + localName + '.bsp'
            }
            return responseData
          }),
          await Com_DL_Begin(localName + '.bsp', gamedir + '/pak0.pk3dir/maps/' + localName + '.bsp')
          .then(responseData => {
            if(responseData && !nameStr.match(/\.bsp$/)) {
              nameStr = 'maps/' + localName + '.bsp'
            }
            return responseData
          }),
        ])).filter(f => f)[0]

        let rename = responseData.response.headers.get('content-disposition')
        let newFilename = localName
        if (rename) {
          let newFilename = (/filename=['"]*(.*?)['"]*$/i).exec(rename)
          if (newFilename) {
            newFilename = localName.replace(/[^\/]*$/, newFilename[1])
            nameStr = nameStr.replace(/[^\/]*$/, newFilename[1])
          }
        }

        Com_DL_Perform(gamedir + '/' + nameStr, gamedir + '/' + newFilename, responseData)
  
        let responseData2 = (await Promise.all([
          await Com_DL_Begin(localName + '.aas', remoteURL + '.aas'),
          await Com_DL_Begin(localName + '.aas', basegame + '/pak0.pk3dir/maps/' + localName + '.aas'),
          await Com_DL_Begin(localName + '.aas', gamedir + '/pak0.pk3dir/maps/' + localName + '.aas'),
        ])).filter(f => f)[0]

        Com_DL_Perform(gamedir + '/maps/' + localName + '.aas', gamedir + '/' + localName, responseData2)


      //} else {
        // valid from disk
      //  responseData = result.contents
      //}

      Cvar_Set( stringToAddress('cl_downloadName'), stringToAddress('') );
      Cvar_Set( stringToAddress('cl_downloadSize'), stringToAddress('0') );
      Cvar_Set( stringToAddress('cl_downloadCount'), stringToAddress('0') );
      Cvar_Set( stringToAddress('cl_downloadTime'), stringToAddress('0') );
      if (nameStr.match(/\.pk3/i) || nameStr.match(/\.bsp/i)) {
        if(cmdStr == 'dlmap') {
          Cbuf_AddText(stringToAddress(` ; fs_restart ; vid_restart ; `))
        } else {
          Cbuf_AddText(stringToAddress(` ; wait 100 ; fs_restart ; ${cmdStr} ${localName} ; `))
        }
      }
    } catch (e) {

    }
  })())
  return waitFor
}

var NET = {
  queue: [],
  port_try: 0,
  reconnect: false,
  socket1Queue: [],
  socket2Queue: [],
  lookup: {},
  lookupCount1: 1,
  lookupCount2: 127,
  downloadCount: 0,
  controller: null,
  NET_AdrToString: NET_AdrToString,
  Sys_Offline: Sys_Offline,
  Sys_SockaddrToString: Sys_SockaddrToString,
  Sys_StringToSockaddr: Sys_StringToSockaddr,
  NET_Sleep: NET_Sleep,
  NET_OpenIP: NET_OpenIP,
  Sys_StringToAdr: Sys_StringToAdr,
  Sys_SendPacket: Sys_SendPacket,
  Sys_IsLANAddress: Sys_IsLANAddress,
  Sys_NET_MulticastLocal: Sys_NET_MulticastLocal,
  CL_Download: CL_Download,
  Com_DL_Cleanup: Com_DL_Cleanup,
  CL_cURL_BeginDownload: CL_cURL_BeginDownload,
}


if (typeof module != 'undefined') {
  // SOMETHING SOMETHING fs.writeFile
  module.exports = NET
}
