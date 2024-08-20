var fs = require('fs')
var path = require('path')
var StreamZip = require('node-stream-zip')

/* NOTE: This code makes no attempt to be fast!

It assumes that an int is at least 32 bits long
*/

var m

function F(X,Y,Z) {return (((X)&(Y)) | ((~(X))&(Z)))}
function G(X,Y,Z) {return (((X)&(Y)) | ((X)&(Z)) | ((Y)&(Z)))}
function H(X,Y,Z) {return ((X)^(Y)^(Z))}
function lshift(x,s) {return (((x)<<(s)) | ((x)>>>(32-(s))))}

/* this applies md4 to 64 byte chunks */
function mdfour64(M)
{
    var AA, BB, CC, DD
    var X = new Uint32Array(16)
    var A, B, C, D

    for (var j=0;j<16;j++)
        X[j] = M[j];

    function ROUND1(a,b,c,d,k,s) { return lshift(a + F(b,c,d) + X[k], s) }
    function ROUND2(a,b,c,d,k,s) { return lshift(a + G(b,c,d) + X[k] + 0x5A827999,s) }
    function ROUND3(a,b,c,d,k,s) { return lshift(a + H(b,c,d) + X[k] + 0x6ED9EBA1,s) }

 	A = m.A; B = m.B; C = m.C; D = m.D;
	AA = A; BB = B; CC = C; DD = D;

    A = ROUND1(A,B,C,D,  0,  3)
    D = ROUND1(D,A,B,C,  1,  7)
    C = ROUND1(C,D,A,B,  2, 11)
    B = ROUND1(B,C,D,A,  3, 19)
   
    A = ROUND1(A,B,C,D,  4,  3)
    D = ROUND1(D,A,B,C,  5,  7)
    C = ROUND1(C,D,A,B,  6, 11)
    B = ROUND1(B,C,D,A,  7, 19)
    
    A = ROUND1(A,B,C,D,  8,  3)
    D = ROUND1(D,A,B,C,  9,  7)
    C = ROUND1(C,D,A,B, 10, 11)
    B = ROUND1(B,C,D,A, 11, 19)
    
    A = ROUND1(A,B,C,D, 12,  3)
    D = ROUND1(D,A,B,C, 13,  7)
    C = ROUND1(C,D,A,B, 14, 11)
    B = ROUND1(B,C,D,A, 15, 19)

    
    A = ROUND2(A,B,C,D,  0,  3)
    D = ROUND2(D,A,B,C,  4,  5)
    C = ROUND2(C,D,A,B,  8,  9)
    B = ROUND2(B,C,D,A, 12, 13)
    
    A = ROUND2(A,B,C,D,  1,  3)
    D = ROUND2(D,A,B,C,  5,  5)
    C = ROUND2(C,D,A,B,  9,  9)
    B = ROUND2(B,C,D,A, 13, 13)
    
    A = ROUND2(A,B,C,D,  2,  3)
    D = ROUND2(D,A,B,C,  6,  5)
    C = ROUND2(C,D,A,B, 10,  9)
    B = ROUND2(B,C,D,A, 14, 13)
    
    A = ROUND2(A,B,C,D,  3,  3)
    D = ROUND2(D,A,B,C,  7,  5)
    C = ROUND2(C,D,A,B, 11,  9)
    B = ROUND2(B,C,D,A, 15, 13)

    
    A = ROUND3(A,B,C,D,  0,  3)
    D = ROUND3(D,A,B,C,  8,  9)
    C = ROUND3(C,D,A,B,  4, 11)
    B = ROUND3(B,C,D,A, 12, 15)
    
    A = ROUND3(A,B,C,D,  2,  3)
    D = ROUND3(D,A,B,C, 10,  9)
    C = ROUND3(C,D,A,B,  6, 11)
    B = ROUND3(B,C,D,A, 14, 15)
    
    A = ROUND3(A,B,C,D,  1,  3)
    D = ROUND3(D,A,B,C,  9,  9)
    C = ROUND3(C,D,A,B,  5, 11)
    B = ROUND3(B,C,D,A, 13, 15)
    
    A = ROUND3(A,B,C,D,  3,  3)
    D = ROUND3(D,A,B,C, 11,  9)
    C = ROUND3(C,D,A,B,  7, 11)
    B = ROUND3(B,C,D,A, 15, 15)

    A += AA; B += BB; C += CC; D += DD;

    for (var j=0;j<16;j++)
        X[j] = 0;

    m.A = A; m.B = B; m.C = C; m.D = D;
}

function copy64(M, input)
{
    for (var i=0;i<16;i++)
        M[i] =
            (input[i*4+3] << 24) |
            (input[i*4+2] << 16) |
            (input[i*4+1] << 8) |
            (input[i*4+0] << 0)
}

function mdfour_begin(md)
{
    md.A = 0x67452301
    md.B = 0xefcdab89
    md.C = 0x98badcfe
    md.D = 0x10325476
    md.totalN = 0
}


function mdfour_tail(input, n)
{
    var buf = new Uint8Array(128)
    var M = new Uint32Array(16)
    var b

    m.totalN += n

    b = m.totalN * 8

    if (n) for(var i=0;i<n;i++) buf[i] = input[i]
    buf[n] = 0x80

    if (n <= 55) {
        buf[56] = (b&0xFF)
        buf[57] = (b>>8)&0xFF
        buf[58] = (b>>16)&0xFF
        buf[59] = (b>>24)&0xFF
        copy64(M, buf)
        mdfour64(M)
    } else {
        buf[120] = (b&0xFF)
        buf[121] = (b>>8)&0xFF
        buf[122] = (b>>16)&0xFF
        buf[123] = (b>>24)&0xFF
        copy64(M, buf)
        mdfour64(M)
        copy64(M, buf.slice(64))
        mdfour64(M)
    }
}

function mdfour_update(md, input, n)
{
    var M = new Uint32Array(16)

    m = md

    if (n == 0) mdfour_tail(input, n)

    while (n - m.totalN >= 64) {
        copy64(M, input.slice(m.totalN, m.totalN + 64))
        mdfour64(M)
        m.totalN += 64
    }

    mdfour_tail(input.slice(m.totalN, m.totalN + 64), n - m.totalN)
}


function mdfour_result(md, out)
{
    out[0] = md.A
    out[1] = md.B
    out[2] = md.C
    out[3] = md.D
}

function mdfour(out, input, n)
{
    var md = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        totalN: 0
    }
    mdfour_begin(md)
    mdfour_update(md, input, n)
    mdfour_result(md, out)
}

async function checksumZip(file) {
    var digest = new Uint32Array(4)
    const zip = new StreamZip({
      file: file,
      storeEntries: true
    })
    var index = await new Promise(resolve => {
        var skipped = 0
        zip.on('ready', async () => {
          console.log('Entries read: ' + zip.entriesCount + ' ' + path.basename(file))
          resolve(Object.values(zip.entries()))
        })
        zip.on('error', resolve)
    })
    var contents = [0]
    var j = 1
    for(var i = 0; i < index.length; i++) {
        var entry = index[i]
        if((entry.method != 0 && entry.method != 8) || entry.size === 0)
            continue
        contents[j++] = entry.crc
    }
    var headers = new Uint8Array(Uint32Array.from(contents).buffer)
    process.stdout.write(JSON.stringify(contents))
    mdfour(digest, headers.slice(4, j * 4), j * 4 - 4)
    var unsigned = new Uint32Array(1)
    unsigned[0] = digest[0] ^ digest[1] ^ digest[2] ^ digest[3]
    return unsigned
}

module.exports = checksumZip

let runChecksum = false
let filename = null
for(let i = 0; i < process.argv.length; i++) {
  let a = process.argv[i]
  if(a.match(__filename)) {
    runChecksum = true
  }
  else if (fs.existsSync(a)) {
    filename = a
  }
}

if(runChecksum && filename) {
  checksumZip(filename).then(digest => {
    process.stdout.write(JSON.stringify(Array.from(digest)))
  })
}
