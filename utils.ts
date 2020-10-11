export const genToken = function (c?: number) {
	const crypto = require('crypto')
    let N = 64
    if(c) N = c
	return crypto.randomBytes(N).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, N)
}
export const genNow = function () {
	const date = new Date()
	const a = date.getTime()
    const b = Math.floor(a / 1000)
    return b
}