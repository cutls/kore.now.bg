"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mysql = __importStar(require("mysql"));
const koa_1 = __importDefault(require("koa"));
const koa_router_1 = __importDefault(require("koa-router"));
const koa_body_1 = __importDefault(require("koa-body"));
const cors_1 = __importDefault(require("@koa/cors"));
const dotenv = __importStar(require("dotenv"));
const qs = __importStar(require("qs"));
dotenv.config();
const knex_1 = __importDefault(require("knex"));
const axios_1 = __importDefault(require("axios"));
const utils_1 = require("./utils");
const util = __importStar(require("util"));
dotenv.config();
const config = process.env;
const dbConfig = {
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_DATABASE,
};
const pool = mysql.createPool(dbConfig);
// @ts-ignore
pool.query = util.promisify(pool.query);
const my = knex_1.default({ client: 'mysql' });
const router = new koa_router_1.default();
const koa = new koa_1.default();
router.get('/login/line', (ctx, next) => {
    const random = Math.floor(Math.random() * (9999 + 1 - 1000)) + 1000;
    const state = random * 3746 + 2365;
    const url = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${config.LINE_ID}&redirect_uri=http://${config.DOMAIN}/login/line/callback&scope=profile&state=${state}`;
    ctx.redirect(url);
});
router.get('/login/line/callback', async (ctx, next) => {
    const { query } = ctx;
    const { state, code } = query;
    if (parseInt(state) % 3746 != 2365) {
        ctx.body = { success: false, error: 'invalid login' };
        return false;
    }
    const headerConfig = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    };
    let accessToken;
    try {
        const tokenRaw = await axios_1.default.post('https://api.line.me/oauth2/v2.1/token', qs.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: `http://${config.DOMAIN}/login/line/callback`,
            client_id: config.LINE_ID,
            client_secret: config.LINE_SECRET,
        }), headerConfig);
        accessToken = tokenRaw.data.access_token;
    }
    catch (e) {
        console.log(e);
        ctx.body = { success: false, error: 'cannot login' };
        return false;
    }
    try {
        const profile = await axios_1.default.get('https://api.line.me/v2/profile', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const userId = profile.data.userId;
        const token = utils_1.genToken();
        const lastused = utils_1.genNow();
        const sql = my(`${config.DB_TABLE}_login`)
            .insert({
            LINEID: userId,
            TOKEN: token,
            LASTUSED: lastused,
        })
            .toString();
        pool.query(sql, (error, results) => {
            if (error)
                console.error(error);
        });
        const get = my(`${config.DB_TABLE}_user`).select('USERNAME').where('LINEID', userId).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.redirect(`http://${config.FRONTEND}/welcome?code=${token}`);
        }
        else {
            ctx.redirect(`http://${config.FRONTEND}/my?code=${token}`);
        }
    }
    catch (e) {
        console.log(e);
        ctx.body = { success: false, error: 'cannot get your profile' };
    }
});
router.get('/login/notify', (ctx, next) => {
    const i = ctx.query.i;
    const url = `https://notify-bot.line.me/oauth/authorize?response_type=code&client_id=${config.NOTIFY_ID}&redirect_uri=http://${config.DOMAIN}/login/notify/callback&scope=notify&state=${i}`;
    ctx.redirect(url);
});
router.get('/logout/notify', async (ctx, next) => {
    const i = ctx.query.i;
    const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', i).toString();
    const results = (await pool.query(get));
    const userId = results[0]['LINEID'];
    const sql = my(`${config.DB_TABLE}_user`).where('LINEID', userId).update({ NOTIFY: '' }).toString();
    await pool.query(sql);
    const url = `http://${config.FRONTEND}/my`;
    ctx.redirect(url);
});
router.get('/logout', async (ctx, next) => {
    const i = ctx.query.i;
    const as = ctx.query.all_session;
    if (as) {
        const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', i).toString();
        const results = (await pool.query(get));
        const userId = results[0]['LINEID'];
        const sql = my(`${config.DB_TABLE}_login`).where('LINEID', userId).delete().toString();
        await pool.query(sql);
    }
    else {
        const sql = my(`${config.DB_TABLE}_login`).where('TOKEN', i).delete().toString();
        await pool.query(sql);
    }
    ctx.body = { success: true };
});
router.get('/login/notify/callback', async (ctx, next) => {
    const { query } = ctx;
    const { state, code } = query;
    const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', ctx.query.state).toString();
    const results = (await pool.query(get));
    if (!results[0]) {
        ctx.body = { success: false, error: 'cannot login' };
        return false;
    }
    const userId = results[0]['LINEID'];
    const headerConfig = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
    };
    let accessToken;
    try {
        const tokenRaw = await axios_1.default.post('https://notify-bot.line.me/oauth/token', qs.stringify({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: `http://${config.DOMAIN}/login/notify/callback`,
            client_id: config.NOTIFY_ID,
            client_secret: config.NOTIFY_SECRET,
        }), headerConfig);
        accessToken = tokenRaw.data.access_token;
    }
    catch (e) {
        console.log(e);
        ctx.body = { success: false, error: 'cannot get the token' };
        return false;
    }
    try {
        const sql = my(`${config.DB_TABLE}_user`)
            .where('LINEID', userId)
            .update({
            NOTIFY: accessToken,
        })
            .toString();
        await pool.query(sql);
        ctx.redirect(`http://${config.FRONTEND}/my`);
    }
    catch (e) {
        console.log(e);
        ctx.body = { success: false, error: 'cannot insert the data' };
    }
});
router.get('/verify_credentials', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    try {
        const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', ctx.query.i).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.body = { success: false, error: 'cannot login' };
            return false;
        }
        const userId = results[0]['LINEID'];
        const regGet = my(`${config.DB_TABLE}_user`).select('NOTIFY').where('LINEID', userId).toString();
        const regCk = (await pool.query(regGet));
        if (!regCk[0]) {
            ctx.body = { success: false, error: 'cannot login' };
            return false;
        }
        const notify = regCk[0]['NOTIFY'];
        let isNotice = false;
        if (notify && notify != '')
            isNotice = true;
        const hasWaiterSql = my(`${config.DB_TABLE}_wait`).select('CODE').where('LINEID', userId).where('VERIFIED', 1).toString();
        const waiterResult = (await pool.query(hasWaiterSql));
        let hasWaiter = false;
        let code = '';
        if (waiterResult[0]) {
            hasWaiter = true;
            code = waiterResult[0]['CODE'];
        }
        const token = utils_1.genToken();
        const sql = my(`${config.DB_TABLE}_login`)
            .where('TOKEN', ctx.query.i)
            .update({
            TOKEN: token,
        })
            .toString();
        await pool.query(sql);
        ctx.body = { success: true, token: token, notify: isNotice, has_waiter: hasWaiter, code: code };
    }
    catch (error) {
        ctx.body = { success: false, error: 'cannot login' };
    }
});
router.get('/is_open', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    const q = ctx.query.q;
    ctx.body = await isOpen(q);
});
router.post('/register', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    const q = ctx.request.body.name;
    const openCk = await isOpen(q);
    if (!openCk.success) {
        ctx.body = { success: false, error: 'cannot use' };
        return false;
    }
    const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', ctx.request.body.i).toString();
    const results = (await pool.query(get));
    if (!results[0]) {
        ctx.body = { success: false, error: 'cannot login' };
        return false;
    }
    const userId = results[0]['LINEID'];
    const sql = my(`${config.DB_TABLE}_user`)
        .insert({
        LINEID: userId,
        USERNAME: q,
    })
        .toString();
    try {
        const tryIns = (await pool.query(sql));
        ctx.body = { success: true };
    }
    catch (error) {
        ctx.body = { success: false, error: `cannot process "${q}"` };
    }
});
router.post('/post', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    const text = ctx.request.body.text;
    if (text.length > 3000 || text.length == 0) {
        ctx.body = { success: false, error: 'bad text' };
        return;
    }
    const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', ctx.request.body.i).toString();
    const results = (await pool.query(get));
    if (!results[0]) {
        ctx.body = { success: false, error: 'cannot login' };
        return false;
    }
    const userId = results[0]['LINEID'];
    const getUsername = my(`${config.DB_TABLE}_user`).select(['USERNAME']).where('LINEID', userId).toString();
    const usernameResults = (await pool.query(getUsername));
    if (!usernameResults[0]) {
        ctx.body = { success: false, error: 'cannot find the user' };
        return false;
    }
    const username = usernameResults[0]['USERNAME'];
    const sql = my(`${config.DB_TABLE}_link`)
        .insert({
        LINEID: userId,
        LINK: text,
    })
        .toString();
    try {
        const tryIns = (await pool.query(sql));
        ctx.body = { success: true, your_link: `https://${config.FRONTEND}/${username}` };
    }
    catch (error) {
        ctx.body = { success: false, error: `cannot process` };
    }
});
router.get('/get', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    try {
        const get = my(`${config.DB_TABLE}_login`).select(['LINEID']).where('TOKEN', ctx.query.i).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.body = { success: false, error: 'cannot login' };
            return false;
        }
        const userId = results[0]['LINEID'];
        const getUsername = my(`${config.DB_TABLE}_user`).select('USERNAME').where('LINEID', userId).toString();
        const getUsernameE = (await pool.query(getUsername));
        const username = getUsernameE[0]['USERNAME'];
        if (username != ctx.query.user) {
            ctx.body = { success: false, error: 'this is not you', needed: true };
            return false;
        }
        const regGet = my(`${config.DB_TABLE}_link`).select('LINK').where('LINEID', userId).toString();
        const regCk = (await pool.query(regGet));
        if (!regCk[0]) {
            ctx.body = { success: false, error: 'cannot login' };
            return false;
        }
        let data = [];
        for (let raw of regCk) {
            data.push(raw['LINK']);
        }
        const token = utils_1.genToken();
        const sql = my(`${config.DB_TABLE}_login`)
            .where('TOKEN', ctx.query.i)
            .update({
            TOKEN: token,
        })
            .toString();
        await pool.query(sql);
        ctx.body = { success: true, token: token, data: data };
    }
    catch (error) {
        ctx.body = { success: false, error: 'cannot process' };
    }
});
router.get('/get_readonly', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    try {
        const get = my(`${config.DB_TABLE}_wait`).select(['LINEID', 'VERIFIED']).where('CODE', ctx.query.i).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.body = { success: false, error: 'cannot use this code' };
            return false;
        }
        const userId = results[0]['LINEID'];
        const verified = results[0]['VERIFIED'];
        if (verified != 2) {
            ctx.body = { success: false, error: 'this code is not available' };
            return false;
        }
        const delCode = my(`${config.DB_TABLE}_wait`).where('CODE', ctx.query.i).delete().toString();
        await pool.query(delCode);
        const regGet = my(`${config.DB_TABLE}_link`).select('LINK').where('LINEID', userId).toString();
        const regCk = (await pool.query(regGet));
        if (!regCk[0]) {
            ctx.body = { success: false, error: 'cannot find the username' };
            return false;
        }
        let data = [];
        for (let raw of regCk) {
            data.push(raw['LINK']);
        }
        const token = utils_1.genToken();
        const sql = my(`${config.DB_TABLE}_wait`).where('CODE', ctx.query.i).delete().toString();
        await pool.query(sql);
        ctx.body = { success: true, data: data };
    }
    catch (error) {
        ctx.body = { success: false, error: 'cannot process' };
    }
});
router.get('/get_auth', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    try {
        const get = my(`${config.DB_TABLE}_user`).select(['LINEID', 'NOTIFY']).where('USERNAME', ctx.query.user).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.body = { success: false, error: 'cannot find the user' };
            return false;
        }
        const userId = results[0]['LINEID'];
        const notify = results[0]['NOTIFY'];
        if (notify)
            await postNotify(notify);
        const code = utils_1.genToken();
        const sql = my(`${config.DB_TABLE}_wait`)
            .insert({
            LINEID: userId,
            CODE: code,
        })
            .toString();
        try {
            const tryIns = (await pool.query(sql));
            ctx.body = { success: true, code: code };
        }
        catch (error) {
            ctx.body = { success: false, error: `cannot process` };
        }
    }
    catch (error) {
        ctx.body = { success: false, error: 'cannot login' };
    }
});
router.get('/is_verified', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    try {
        const get = my(`${config.DB_TABLE}_wait`).select('VERIFIED').where('CODE', ctx.query.code).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            ctx.body = { success: false, error: 'cannot find the code' };
            return false;
        }
        const verified = results[0]['VERIFIED'];
        if (verified === 1) {
            ctx.body = { success: false, error: 'please wait...' };
            return false;
        }
        else if (verified === 0) {
            const sql = my(`${config.DB_TABLE}_wait`).where('CODE', ctx.query.code).delete().toString();
            await pool.query(sql);
            ctx.body = { success: false, error: 'rejected', rejected: true };
            return false;
        }
        if (verified === 2) {
            ctx.body = { success: true, verified: true };
            return false;
        }
    }
    catch (error) {
        ctx.body = { success: false, error: 'cannot login' };
    }
});
router.get('/action/:action', async (ctx, next) => {
    ctx.set('Access-Control-Allow-Origin', '*');
    const action = ctx.params.action;
    let verified = 0;
    if (action == 'accept') {
        verified = 2;
    }
    const get = my(`${config.DB_TABLE}_login`).select('LINEID').where('TOKEN', ctx.query.i).toString();
    const results = (await pool.query(get));
    if (!results[0]) {
        ctx.body = { success: false, error: 'cannot login' };
        return false;
    }
    const userId = results[0]['LINEID'];
    const sql = my(`${config.DB_TABLE}_wait`).where('CODE', ctx.query.code).where('LINEID', userId).update({ VERIFIED: verified }).toString();
    const aResult = (await pool.query(sql));
    ctx.body = { success: true, action: action };
});
koa.use(cors_1.default());
koa.use(koa_body_1.default());
koa.use(router.routes());
koa.use(router.allowedMethods());
koa.listen(process.env.PORT || 8000, () => {
    console.log('Server started!!');
});
async function isOpen(q) {
    let error = false;
    if (!q.match(/^[a-z0-9_]+$/g))
        error = true;
    if (q == 'welcome')
        error = true;
    if (q == 'my')
        error = true;
    if (q == 'login')
        error = true;
    if (q == 'logout')
        error = true;
    if (q == '')
        error = true;
    if (q == 'user')
        error = true;
    if (q == 'username')
        error = true;
    if (q == 'kore')
        error = true;
    if (q.length > 30)
        error = true;
    if (error) {
        return { success: false, error: `cannot use "${q}"` };
    }
    try {
        const get = my(`${config.DB_TABLE}_user`).select('USERNAME').where('USERNAME', q).toString();
        const results = (await pool.query(get));
        if (!results[0]) {
            return { success: true, message: `can use "${q}"` };
        }
        else {
            return { success: false, error: `cannot use "${q}"` };
        }
    }
    catch (error) {
        return { success: false, error: `cannot process "${q}"` };
    }
}
async function postNotify(token) {
    const tokenRaw = await axios_1.default.post('https://notify-api.line.me/api/notify', qs.stringify({
        message: '認証してください。 https://kore.now.sh',
    }), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Bearer ${token}`,
        },
    });
}
