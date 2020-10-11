"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.genNow = exports.genToken = void 0;
exports.genToken = function (c) {
    const crypto = require('crypto');
    let N = 64;
    if (c)
        N = c;
    return crypto.randomBytes(N).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, N);
};
exports.genNow = function () {
    const date = new Date();
    const a = date.getTime();
    const b = Math.floor(a / 1000);
    return b;
};
