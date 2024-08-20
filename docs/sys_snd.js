const AUDIO_DRIVER = "Web Audio"

let soundEffects = {}

// TODO: finish spatialization 
// https://github.com/mdn/webaudio-examples/blob/master/spacialization/index.html

// So that we don't keep retrying missing sounds
const REMOTE_SOUNDS = {}
function S_CodecLoad (name, info) {
  //if(!SND.inited) {
  //  return 0
  //}
  let filenameStr = addressToString(name)
  if(filenameStr.length == 0) {
    return 0
  }
  if(typeof REMOTE_SOUNDS[filenameStr] != 'undefined'
    && !REMOTE_SOUNDS[filenameStr]
  ) {
    return 0
  }
  if(!filenameStr.endsWith('.ogg')) {
    filenameStr = filenameStr.replace(/\..*?$/, '.ogg')
  }
  let existing = Object.values(soundEffects)
  for(let i = 0; i < existing.length; i++) {
    if(existing[i][0].name == filenameStr) {
      //soundEffects[filenameStr] = existing[i]
      return 1
    }
  }

  let buf = Z_Malloc(8) // pointer to pointer
  HEAPU32[buf >> 2] = 0
  
  if ((length = FS_ReadFile(stringToAddress(filenameStr), buf)) > 0 && HEAPU32[buf >> 2] > 0) {
    let thisAudio = document.createElement('AUDIO')
    thisAudio.addEventListener('load', function () {
      debugger
    })
    let audioView = Array.from(HEAPU8.slice(HEAPU32[buf >> 2], HEAPU32[buf >> 2] + length))
    let utfEncoded = audioView.map(function (c) { return String.fromCharCode(c) }).join('')
    thisAudio.src = 'data:audio/ogg;base64,' + btoa(utfEncoded)
    thisAudio.name = filenameStr
    console.log('loading audio:' + filenameStr)
    //thisAudio.address = name - 28
    soundEffects[filenameStr] = [thisAudio]
    if(info) {
      HEAPU32[(info >> 2) + 4] = length
    }
    FS_FreeFile(HEAPU32[buf >> 2])
    Z_Free(buf)
    return 1
  }

  // TODO: try alternative download paths and make file available for next time?
  if(typeof REMOTE_SOUNDS[filenameStr] == 'undefined') {
    REMOTE_SOUNDS[filenameStr] = true

    let gamedir = addressToString(FS_GetCurrentGameDir())
    let remoteFile = 'pak0.pk3dir/' + filenameStr
    Promise.resolve(Com_DL_Begin(gamedir + '/' + remoteFile, '/' + gamedir + '/' + remoteFile + '?alt')
        .then(function (responseData) {
          Com_DL_Perform(gamedir + '/' + remoteFile, remoteFile, responseData)
          if(!responseData) {
            REMOTE_SOUNDS[filenameStr] = false
          }
        }))
  }


  Z_Free(buf)
  return 0
}

let SND = {
  SNDDMA_Init: function () {
    SND.inited = true
    if(HEAPU32[first_click >> 2]) {
      return 0
    }
    HEAPU32[(dma >> 2) + 0] = 2
    HEAPU32[(dma >> 2) + 1] = 16384
    HEAPU32[(dma >> 2) + 2] = 16384 / 2
    HEAPU32[(dma >> 2) + 3] = 1
    HEAPU32[(dma >> 2) + 4] = 32
    HEAPU32[(dma >> 2) + 5] = 1
    HEAPU32[(dma >> 2) + 6] = 44100
    //HEAPU32[(dma >> 2) + 7] = Z_Malloc(16384 * 200)
    HEAPU32[(dma >> 2) + 8] = Z_Malloc(AUDIO_DRIVER.length + 1)
    stringToAddress(AUDIO_DRIVER, HEAPU32[(dma >> 2) + 7])
    if(!listener) {
      InitListener()
    }
    return 1
  },
  SNDDMA_Shutdown: function () {
    if(HEAPU32[(dma >> 2) + 8]) {
      //Z_Free(HEAPU32[(dma >> 2) + 7])
      Z_Free(HEAPU32[(dma >> 2) + 8])
      //HEAPU32[(dma >> 2) + 7] = 0
      HEAPU32[(dma >> 2) + 8] = 0
    }
    HEAPU32[first_click >> 2] = 1
  },
  SNDDMA_BeginPainting: function () {},
  SNDDMA_Submit: function () {},
  SNDDMA_GetDMAPos: function () {
    return Sys_Milliseconds()
  },



  S_CodecCloseStream: function () {},
  S_CodecOpenStream: function () {},
  S_CodecReadStream: function () {},
  S_CodecLoad: S_CodecLoad,
  S_LoadSound: S_CodecLoad,
  S_CodecInit: function () {},
  S_CodecShutdown: function () {},
  S_Base_StartSound: S_Base_StartSound,
  S_Base_StartLocalSound: S_Base_StartLocalSound,
  S_Base_AddLoopingSound: S_Base_AddLoopingSound,
  S_Base_AddRealLoopingSound: S_Base_AddLoopingSound,
  S_Base_StopLoopingSound: S_Base_StopLoopingSound,
  
  S_Base_ClearLoopingSounds: S_Base_ClearLoopingSounds,
  S_Base_ClearSoundBuffer: S_Base_ClearLoopingSounds,
  S_Base_StopAllSounds: S_Base_ClearLoopingSounds,

  S_Base_StopBackgroundTrack: S_Base_StopBackgroundTrack,
  S_RawSamples: S_RawSamples,
  S_Base_Respatialize: S_Base_Respatialize,
  S_Base_UpdateEntityPosition: S_Base_UpdateEntityPosition,
  S_Base_Update: S_Base_Update,
  S_Base_RawSamples: S_Base_RawSamples,
  S_Base_StartBackgroundTrack: S_Base_StartBackgroundTrack,
}


function S_Base_StartBackgroundTrack() {

}


function S_Base_Update() {

}


function S_Base_StopBackgroundTrack() {

}


function S_RawSamples() {

}


function S_Base_Respatialize(entityNum, head, axis, inwater) {
  //listener.setPosition(HEAPF32[(head >> 2) + 0], HEAPF32[(head >> 2) + 1], HEAPF32[(head >> 2) + 2])
  //listener.setOrientation(HEAPF32[(axis >> 2) + 0], HEAPF32[(axis >> 2) + 1], HEAPF32[(axis >> 2) + 2], 0, 1, 0)
}


function S_Base_RawSamples() {

}


let audioCtx
let listener 
function InitListener() {
  audioCtx = new AudioContext()
  listener = audioCtx.listener;

  // Let's set the position of our listener based on where our boombox is.
  const posX = window.innerWidth / 2;
  const posY = window.innerHeight / 2;
  const posZ = 300;

  if (listener.positionX) {
    // Standard way
    listener.positionX.value = posX;
    listener.positionY.value = posY;
    listener.positionZ.value = posZ - 5;
  } else {
    // Deprecated way; still needed (July 2022)
    listener.setPosition(posX, posY, posZ - 5);
  }

  if (listener.forwardX) {
    // Standard way
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  } else {
    // Deprecated way; still needed (July 2022)
    listener.setOrientation(0, 0, -1, 0, 1, 0);
  }
}


let soundTracks = {}
function FindTrack(name) {
  if(name.length == 0) {
    return
  }
  if(!soundEffects[name]) {
    S_CodecLoad(stringToAddress(name))
  }
  if(!soundEffects[name]) {
    return
  }
  if(!soundTracks[name]) {
    soundTracks[name] = []
  }
  let now = Date.now()
  let i
  for(i = 0; i < soundTracks[name].length; i++) {
    // check for existing sound elements available for playing
    if(!soundTracks[name][i].mediaElement.lastPlayed
      || soundTracks[name][i].mediaElement.lastPlayed + soundTracks[name][i].duration < now) {
      return soundTracks[name][i]
    }
    // prevent the sound from starting again within less than 100ms
    if(now - soundTracks[name][i].mediaElement.lastPlayed < 10) {
      return
    }
  }

  if(i >= 4) { 
    console.log('Warning adding too many tracks: ' + addressToString(name))
    return
  }

  if(!listener) {
    InitListener()
  }

  let audioSrc = FindSound(name)
  if(audioSrc.track) {
    return audioSrc.track
  }
  let track = new MediaElementAudioSourceNode(audioCtx, {
    mediaElement: audioSrc,
  })
  audioSrc.track = track
  const posX = window.innerWidth / 2;
  const posY = window.innerHeight / 2;
  const posZ = 300 - 5;
  let panner = new PannerNode(audioCtx, {
    panningModel: "HRTF",
    distanceModel: "linear",
    positionX: posX,
    positionY: posY,
    positionZ: posZ,
    orientationX: 0.0,
    orientationY: 0.0,
    orientationZ: -1.0,
    refDistance: 1,
    maxDistance: 20_000,
    rolloffFactor: 10,
    coneInnerAngle: 40,
    coneOuterAngle: 50,
    coneOuterGain: 0.4,
  })
  track.panner = panner
  track
  //        .connect(gainNode)
  //        .connect(stereoPanner)
          .connect(panner)
          .connect(audioCtx.destination);
  soundTracks[name].push(track)
  return track
}


//let channels = []

function S_Base_StartLocalSound(sfx, channel) {
  return S_Base_StartSound(0, null, channel, sfx)

}


const entities = {}

function S_Base_StartSound(origin, entityNum, entchannel, sfx) {
  if(!SND.inited) {
    return
  }
  if(HEAPU32[first_click >> 2]) {
    return
  }
  let name = addressToString(s_knownSfx + sfx * 100 + 28).replace(/\..*?$/, '.ogg')
  //let name = sfx-72

  /*
  let now = Date.now()
  for(i = 0; i < channels.length; i++) {
    if(!channels[i].lastPlayed || channels[i].lastPlayed + soundEffects[name][0].duration < now) {
      break;
    }
  }
  */
  if(origin == 0) {
    let sound = FindSound(name)
    if(sound) {
      sound.lastPlayed = Date.now()
      sound.play()
    }
    // TODO: reset track panner location
    return
  } else {
    entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
  }

  let track = FindTrack(name)
  if(track) {
    track.mediaElement.lastPlayed = Date.now()
    track.mediaElement.play()
    track.panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
  }
    // TODO: reset track panner location
}


const looping = []

function S_Base_AddLoopingSound(entityNum, origin, velocity, sfx) {
  if(!SND.inited) {
    return
  }
  if(HEAPU32[first_click >> 2]) {
    return
  }

  let name = addressToString(s_knownSfx + sfx * 100 + 28).replace(/\..*?$/, '.ogg')
  // TODO: basically the same thing as above but add an event handler
  let track = FindTrack(name)
  if(origin) {
    entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
  }
  if(track) {
    track.mediaElement.lastPlayed = Date.now()
    track.mediaElement.play()
    track.mediaElement.onEnded = () => {
      track.mediaElement.play()
    }
    if(looping[entityNum] && looping[entityNum] != track) {
      //looping[entityNum].mediaElement.pause()
      looping[entityNum].mediaElement.onEnded = null
      looping[entityNum] = null
    }
    looping[entityNum] = track
    if(origin) {
      //track.panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
    }
    //audioElement.addEventListener('ended', )
  }
}


function S_Base_UpdateEntityPosition(entityNum, origin) {
  if(origin) {
    entities[entityNum] = [HEAPF32[(origin >> 2) + 0], HEAPF32[(origin >> 2) + 1], HEAPF32[(origin >> 2) + 2]]
    if(looping[entityNum]) {
      //looping[entityNum].panner.setPosition(entities[entityNum][0], entities[entityNum][1], entities[entityNum][2])
    }
  }
}


function S_Base_StopLoopingSound(entityNum) {
  if(looping[entityNum]) {
    looping[entityNum].mediaElement.pause()
    looping[entityNum].mediaElement.onEnded = null
    looping[entityNum] = null
  }
}


function S_Base_ClearLoopingSounds() {
  for(let i = 0; i < looping.length; i++) {
    if(looping[i]) {
      looping[i].mediaElement.pause()
      looping[i].mediaElement.onEnded = null
      looping[i] = null
    }
  }
}



function FindSound(name) {
  if(name.length == 0) {
    return
  }
  if(!soundEffects[name]) {
    S_CodecLoad(stringToAddress(name))
  }
  if(!soundEffects[name]) {
    return
  }
  let now = Date.now()
  for(let i = 0; i < soundEffects[name].length; i++) {
    // check for existing sound elements available for playing
    if(!soundEffects[name][i].lastPlayed
      || soundEffects[name][i].lastPlayed + soundEffects[name][i].duration < now) {
      return soundEffects[name][i]
    }
    // prevent the sound from starting again within less than 100ms
    if(now - soundEffects[name][i].lastPlayed < 10) {
      return
    }
  }
  // make sure there aren't too many sounds
  if(soundEffects[name].length > 8) {
    console.log('Warning adding too many sounds: ' + addressToString(name))
    return
  }
  let newInstance = soundEffects[name][0].cloneNode()
  soundEffects[name].push(newInstance)
  return newInstance
}

