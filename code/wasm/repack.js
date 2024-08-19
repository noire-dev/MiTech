// middleware for repacking pk3 files
const fs = require('fs')
const path = require('path')
const {glob} = require('glob')
const {spawnSync} = require('child_process')

const MODNAME = 'milab'
const DEFAULT_MODEL = 'munro'
const SOURCE_PATH = path.join(__dirname, '../../docs/')
const OUTPUT_PATH = path.join(__dirname, '../../docs/maps/')

const SUPPORTED_FORMATS = [
  '.cfg', '.qvm', '.jts', '.bot',
  '.txt', '.hit', '.dat', // for fonts
  '.shader', '.shaderx',
  '.crosshair', '.skin', '.font',
  '.config', '.menu',
  '.defi', // CPMA game mode definition
  '.arena', // map based game mode definition
  // these can be compiled in game to run bot AI
  '.c', '.h', '.scc',
  // camera files
  '.cam',
  // can load async, but new repacking system includes small ones
  //'.md5', '.md3', '.iqm', '.mdr',
  '.dat', 
  //'.map', '.aas', '.bsp', 
]

// include icons because menu uses it to load, not a lazy check unforntunatly
const FILE_TYPES = new RegExp('menu\/|fonts\/|gfx\/2d\/|players\/[^\/]*?\/icon.*\.tga|players\/' + DEFAULT_MODEL + '\/|_tracemap\.tga', 'ig')

let lockFunc = false
let lockPromise
async function compareZip(pk3File) {
  if(!lockPromise) {
    lockPromise = new Promise(resolve => lockFunc = resolve)
  } else {
    await lockPromise
  }
  // compare corresponding zip and mtime
  let sourcePath = path.join(SOURCE_PATH, pk3File + 'dir')
  // form a docs/MODNAME/pak0.pk3dir style path
  let finishedPath = path.join(OUTPUT_PATH, pk3File)
  if(!finishedPath.includes('.pk3'))
    throw new Error('abort')

  if(!fs.existsSync(finishedPath)
    || fs.statSync(finishedPath).mtime < fs.statSync(sourcePath).mtime - 1000) {

    // compare contents of folder with directory contents
    const textFiles = (await glob('**/*', { 
      ignore: 'node_modules/**', 
      cwd: sourcePath 
    })).filter(f => SUPPORTED_FORMATS.includes(path.extname(f).toLocaleLowerCase()) || f.match(FILE_TYPES))

    // TODO: repack the pk3 file
    let tempFile = 'Archive.' + (Date.now() + '').substring(20, -5)
    for(let pack_i = 0; pack_i < textFiles.length; pack_i++) {
      console.log(Math.round(pack_i / textFiles.length * 100, 2), textFiles[pack_i])
      let startArgs = ['-9']
      //.concat(pack_i == textFiles.length - 1 ? ['-o'] : [])
        .concat(['-u', tempFile, textFiles[pack_i]])
      //console.log(startArgs)  
      
      await spawnSync('zip', startArgs, {
        cwd: sourcePath,
        timeout: 2000,
      })
      
      // slow it down a little or write locks won't work and junk files don't get merged in
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    if(fs.existsSync(finishedPath))
      fs.unlinkSync(finishedPath)

    fs.renameSync(path.join(sourcePath, tempFile), finishedPath)
  }

  Promise.resolve(lockPromise)
  lockFunc()
  lockPromise = false
}


async function convertImage(pk3File) {
  let altName = pk3File.replace(path.extname(pk3File), '.tga')
  let altPath = path.join(SOURCE_PATH, altName)
  let pk3Path = path.join(SOURCE_PATH, pk3File)
  let force = false
  if((!force && fs.existsSync(pk3Path))) {
    return pk3Path
  }
  // restrict file access for existing files
  //if(pk3File.indexOf('.pk3dir') > -1) {
  //  let altFile = path.join(SOURCE_PATH, MODNAME, pk3File.split('/').slice(2).join('/'))
  //  if(fs.existsSync(altFile)) {
  //    return altFile
  //  }
  //}
  if(!fs.existsSync(altPath)) {
    altPath = path.join(SOURCE_PATH, MODNAME, pk3File.split('/').slice(2).join('/').replace(path.extname(pk3File), '.tga'))
    if(fs.existsSync(altPath)) {
      try {
        fs.mkdirSync(path.dirname(pk3Path), { recursive: true });
      } catch (e) {
        console.error(e)
      }
    }
  }

  if( (force || !fs.existsSync(pk3Path)) && fs.existsSync(altPath)) {

    let alphaCmd
    try {
      let alphaProcess = await spawnSync('magick', [altPath, '-scale', '1x1!', '-format', "'%[fx:int(255*a+.5)]'", 'info:-'], {
        cwd: SOURCE_PATH,
        timeout: 3000,
      })
      alphaCmd = alphaProcess.stdout.toString('utf-8')
      //console.log(alphaCmd)
      //console.log(alphaProcess.stderr.toString('utf-8'))
    } catch (e) {
      console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
    }

    //const MATCH = /false/ig
    const MATCH = /'0'|'255'/ig
    if(/* true || TODO: allAlpha? */ !alphaCmd.match(MATCH) && pk3File.indexOf('.png') == -1
      || alphaCmd.match(MATCH) && pk3File.indexOf('.jpg') == -1) {
      if(fs.existsSync(pk3Path)) {
        fs.unlinkSync(pk3Path)
      }
      return
    }

// make all white with correct opacity
// magick docs/MODNAME/pak0.pk3dir/gfx/misc/smokepuff3.tga -compose CopyOpacity -layers merge docs/MODNAME/pak0.pk3dir/gfx/misc/smokepuff3.png

    let imageProcess
    if(pk3File.indexOf('.png') != -1) {
      imageProcess = await spawnSync('magick', [altPath, '-auto-orient', '-quality', '50%', pk3Path], {
        cwd: SOURCE_PATH,
        timeout: 3000,
      })
  
    } else
    imageProcess = await spawnSync('magick', [altPath, '-quality', '50%', pk3Path], {
      cwd: SOURCE_PATH,
      timeout: 3000,
    })
    //console.log('magick', [altPath, '-quality', '50%', pk3Path], imageProcess.stdout.toString('utf-8'))
    
    await new Promise((resolve) => setTimeout(resolve, 100))

    return pk3Path
  }
}


async function checkForRepack(request, response, next) {

  let isPk3Path = request.originalUrl.includes('maps/')
    && request.originalUrl.includes('.pk3')
  // definitely requesting a repacked file
  if(isPk3Path) {
    let mapPath = request.originalUrl.substr(request.originalUrl.indexOf('maps/') + 5)
    .replace(/\?.*$/gi, '')
      // form a docs/MODNAME/pak0.pk3dir style path
    if(fs.existsSync(path.join(SOURCE_PATH, mapPath + 'dir'))) {
      // compare contents of folder with contents of corresponding zip and mtime
      await compareZip(mapPath) 

      // return pk3 file guarunteed fresh
      let outputPath = path.join(OUTPUT_PATH, mapPath)
      fs.createReadStream(outputPath).pipe(response);
      return response
    }
  }

  // TODO: requesting an image, convert it
  if(request.originalUrl.includes('.png') || request.originalUrl.includes('.jpg')) {
    let altPath = await convertImage(request.originalUrl.replace(/\?.*$/gi, ''))
    if(altPath) {
      fs.createReadStream(altPath).pipe(response);
      return response
    }
  }

  // TODO: requesting audio, transcode it


  return next()

}

const IMAGE_TYPES = new RegExp('(' + [
  '.png',
  '.jpg',
  '.jpeg',
  '.tga',
  '.gif',
  '.pcx',
  '.webp',
  '.hdr',
  '.dds',
].join('|') + ')$')

const MATCH_PALETTE = /palette\s"(.*?)"\s([0-9]+(,[0-9]+)*)/ig

async function generatePalette(pk3File) {
  let pk3Path = path.join(SOURCE_PATH, pk3File, 'pak0.pk3dir')
  if(!fs.existsSync(pk3Path)) {
    return
  }

  let paletteFile = path.join(pk3Path, 'scripts/palette.shader')

  var palette = {}
  var existingPalette = ''
  if(fs.existsSync(paletteFile)) {
    existingPalette = fs.readFileSync(paletteFile).toString('utf-8')
    var m

    while((m = (MATCH_PALETTE).exec(existingPalette)) !== null) {
      palette[m[1]] = m[2]
    }
    existingPalette = ''
  }

  const imageFiles = (await glob('**/*', { 
    ignore: 'node_modules/**', 
    cwd: pk3Path 
  })).filter(f => f.match(IMAGE_TYPES))

  for(let image_i = 0; image_i < imageFiles.length; image_i++) {

    console.log(Math.round(image_i / imageFiles.length * 100, 2), imageFiles[image_i])

    if(imageFiles[image_i].indexOf('.png') == -1 && imageFiles[image_i].indexOf('.jpg') == -1) {
      await convertImage(path.join('/', pk3File, 'pak0.pk3dir', imageFiles[image_i].replace(path.extname(imageFiles[image_i]), '.png')))
      await convertImage(path.join('/', pk3File, 'pak0.pk3dir', imageFiles[image_i].replace(path.extname(imageFiles[image_i]), '.jpg')))
    }

    if(typeof palette[imageFiles[image_i]] != 'undefined') {
      continue
    }

    // get average image color for palette
    try {
      let alphaProcess = await spawnSync('convert', [
        imageFiles[image_i], '-resize', '1x1\!', '-format', '%[fx:int(255*a+.5)],%[fx:int(255*r+.5)],%[fx:int(255*g+.5)],%[fx:int(255*b+.5)]', 'info:-'
      ], {
        cwd: pk3Path,
        timeout: 3000,
      })
      let colorCmd = alphaProcess.stdout.toString('utf-8')
      palette[imageFiles[image_i]] = colorCmd
      console.log(imageFiles[image_i], colorCmd)
    } catch (e) {
      console.error(e.message, (e.output || '').toString('utf-8').substr(0, 1000))
    }
    //palette[imagePath] = `0, 0, 0`
  }


  existingPalette = `palettes/default
  {
  ${Object.keys(palette).map((k, i) => `  palette "${k.replace(pk3Path, '')}" ${palette[k]}`).join('\n')}
  }
  `
    fs.writeFileSync(paletteFile, existingPalette)
  

}




async function convertAudio(pk3File) {
  let pk3Path = path.join(SOURCE_PATH, pk3File)
  let altPath = path.join(SOURCE_PATH, pk3File).replace(path.extname(pk3File), '.ogg')
  if(fs.existsSync(altPath)) {
    console.log('file already exists ' + pk3Path)
    return altPath
  }

  if(!fs.existsSync(pk3Path)) {
    console.log('file does not exist ' + pk3Path)
    return
  }

  let audioProcess = await spawnSync('oggenc', ['-q', '7', '--quiet', pk3Path, '-n', altPath], {
    cwd: SOURCE_PATH,
    timeout: 3000,
  })

  await new Promise((resolve) => setTimeout(resolve, 100))
  console.log(audioProcess.stderr.toString('utf-8'))
  console.log(audioProcess.stdout.toString('utf-8'))

  return pk3Path
}



const AUDIO_TYPES = new RegExp('(' + [
  '.wav',
  '.mp3',
].join('|') + ')$')


async function convertSounds(pk3File) {
  let pk3Path = path.join(SOURCE_PATH, pk3File, 'pak0.pk3dir')
  if(!fs.existsSync(pk3Path)) {
    return
  }

  const audioFiles = (await glob('**/*', { 
    ignore: 'node_modules/**', 
    cwd: pk3Path 
  })).filter(f => f.match(AUDIO_TYPES))

  for(let audio_i = 0; audio_i < audioFiles.length; audio_i++) {

    console.log(Math.round(audio_i / audioFiles.length * 100, 2), audioFiles[audio_i])

    if(audioFiles[audio_i].indexOf('.ogg') == -1) {
      await convertAudio(path.join('/', pk3File, 'pak0.pk3dir', audioFiles[audio_i]))
    }
  }

 
}



module.exports = checkForRepack


if(require.main === module && process.argv[1] == __filename) {
  generatePalette(MODNAME)
  .then(() => convertSounds(MODNAME))
  .then(() => compareZip(path.join(MODNAME, 'pak0.pk3')))
  .then(result => {
    console.log(result)
  })
}

