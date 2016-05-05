var fs = require('fs'),
    url = require('url'),
    express = require('express'),
    expressSession = require('express-session'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    pg = require('pg'),
    RedisStore = require('connect-redis')(expressSession),
    EventEmitter = require('events'),
    OAuth = require('oauth'),
    swig = require('swig'),
    config = require('./config')

var API_BASE = 'https://api.twitter.com/1.1/',
    UPDATE_INTERVAL = 10000

var app = express(),
    oauth = new OAuth.OAuth(
        'https://api.twitter.com/oauth/request_token',
        'https://api.twitter.com/oauth/access_token',
        config.clientKey,
        config.clientSecret,
        '1.0A',
        url.resolve(config.baseUrl, '/callback'),
        'HMAC-SHA1')


app.use(expressSession({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: new RedisStore({}),
}))

app.use(cookieParser())
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use('/bootstrap', express.static(__dirname + '/node_modules/bootstrap/dist'))
app.use('/bootswatch', express.static(__dirname + '/node_modules/bootswatch'))
app.use('/jquery', express.static(__dirname + '/node_modules/jquery/dist'))
app.use('/moment', express.static(__dirname + '/node_modules/moment/min'))
app.use('/static', express.static(__dirname + '/static'))

app.engine('swig', swig.renderFile)
app.set('view engine', 'swig')
app.set('views', __dirname + '/views')

var muteEvents = new EventEmitter()

function lookupUser(userId, cb) {
    pg.connect(config.database, function (err, client, done) {
        var handleError = function (err) {
            if (!err) {return false}
            if (client) {done(client)}
            cb(err)
            return true
        }

        if (handleError(err)) { return }

        client.query('select screen_name, access_token, access_token_secret from "user" where id=$1', [userId], function (err, result) {
            if (handleError(err)) { return }

            if (result.rows.length == 0) {
                done()
                cb()
                return
            }

            var user = {
                id: userId,
                screenName: result.rows[0].screen_name,
                accessToken: result.rows[0].access_token,
                accessTokenSecret: result.rows[0].access_token_secret,
                mutes: {},
            }

            var query = client.query('select screen_name, start_time, end_time from "mute" where user_id=$1', [userId])
            query.on('error', handleError)
            query.on('row', function (row) {
                user.mutes[row.screen_name] = {
                    startTime: row.start_time,
                    endTime: row.end_time,
                }
            })
            query.on('end', function () {
                done()
                cb(null, user)
            })
        })
    })
}

function mute(userId, accessToken, accessTokenSecret, screenName, startTime, endTime, cb) {
    oauth.post(API_BASE + 'mutes/users/create.json', accessToken, accessTokenSecret, {screen_name: screenName}, function (err, data, response) {
        if (err) {
            console.log(err)
            cb(err, null)
            return
        }

        pg.connect(config.database, function (err, client, done) {
            var handleError = function (err) {
                if (!err) {return false}
                if (client) {done(client)}
                cb(err)
                return true
            }

            var handleSuccess = function () {
                if (client) {done(client)}
                cb()
                muteEvents.emit('mute', userId, screenName)
                return true
            }

            client.query('select 1 from "mute" where user_id = $1 and screen_name = $2', [userId, screenName], function (err, result) {
                if (handleError(err)) { return }

                if (result.rows.length === 0) {
                    console.log('inserting new mute for screen name ' + screenName)
                    client.query('insert into "mute" (user_id, screen_name, start_time, end_time) values ($1, $2, $3, $4)', [userId, screenName, startTime, endTime], function (err, result) {
                        handleError(err) || handleSuccess()
                    })
                } else {
                    console.log('updating mute with for screen name ' + screenName)
                    client.query('update "mute" set start_time = $1, end_time = $2 where user_id = $3 and screen_name = $4', [startTime, endTime, userId, screenName], function (err, result) {
                        handleError(err) || handleSuccess()
                    })
                }
            })
        })
    })
}

function unmute(userId, accessToken, accessTokenSecret, screenName, cb) {
    console.log('attempting to unmute ' + screenName)
    oauth.post(API_BASE + 'mutes/users/destroy.json', accessToken, accessTokenSecret, {screen_name: screenName}, function (err, data, response) {
        if (err) {
            var ignore = false;

            if (err.data) {
                var errData = JSON.parse(err.data)
                if (errData.errors.some(function (o) { return o.code === 272 })) {
                    console.log(screenName + ' already unmuted, moving on!')
                    ignore = true;
                }
            }

            if (!ignore) {
                console.log(err)
                cb(err)
                return
            }
        }

        pg.connect(config.database, function (err, client, done) {
            if (err) {
                console.log(err)
                done(client)
                cb(err)
                return
            }
            client.query('delete from "mute" where user_id = $1 and screen_name = $2', [userId, screenName], function (err, result) {
                done()
                cb()
                muteEvents.emit('unmute', userId, screenName)
            })
        })
    })
}

// search all users for muted friends that have expired
function tick() {
    pg.connect(config.database, function (err, client, done) {
        var handleError = function (err) {
            if (!err) {return false}
            if (client) {done(client)}
            return true
        }

        if (handleError(err)) { return }

        var query = client.query('select "user".id uid, "user".access_token tok, "user".access_token_secret sec, mute.screen_name mname, mute.start_time mstart, mute.end_time mend from "user" join "mute" on "user".id = "mute".user_id', [])
        query.on('error', handleError)
        query.on('row', function (row) {
            if (row.mend && row.mend.getTime() <= Date.now()) {
                console.log('unmuting')
                unmute(row.uid, row.tok, row.sec, row.mname, function (err, data, response) {
                    // unmute successful
                    console.log(row.uid + ": unmuted " + row.mname);
                })
            }
        })
        query.on('end', function () {
            done()
            setTimeout(tick, UPDATE_INTERVAL)
        })
    })
}

app.get('/', function (req, res) {
    if (req.session.user) {
        lookupUser(req.session.user, function (err, user) {
            if (err) {
                res.sendStatus(400)
                console.log('Failed to find user: ' + err)
                return
            }

            if (!user) {
                res.render('logged-out')
            } else {
                res.render('logged-in', {
                    title: user.screenName,
                    user: user,
                })
            }
        })
    }
    else {
        res.render('logged-out')
    }
})

app.get('/login', function (req, res) {
    oauth.getOAuthRequestToken(function (err, token, tokenSecret, parsedQueryString) {
        if (err) {
            res.sendStatus(400)
            console.log('failed to get request token: ' + JSON.stringify(err))
            return
        }

        req.session.requestTokenSecret = tokenSecret
        res.redirect('https://api.twitter.com/oauth/authorize?oauth_token='+token)
    })
})

app.get('/logout', function (req, res) {
    delete req.session.user
    res.redirect('/')
})

app.get('/callback', function (req, res) {
    var requestToken = req.query.oauth_token
    var verifier = req.query.oauth_verifier
    var requestSecret = req.session.requestTokenSecret
    delete req.session.requestTokenSecret

    console.log('getting access token')

    oauth.getOAuthAccessToken(requestToken, requestSecret, verifier, function (err, token, tokenSecret, parsedQueryString) {
        if (err) {
            res.sendStatus(400)
            console.log('failed to get access token: ' + JSON.stringify(err))
            return
        }

        console.log('verifying credentials')

        oauth.get(API_BASE + 'account/verify_credentials.json', token, tokenSecret, function (err, data, response) {
            if (err) {
                res.sendStatus(400)
                console.log('failed to verify credentials: ' + JSON.stringify(err))
                return
            }

            var userInfo = JSON.parse(data),
                twitterId = userInfo['id_str'],
                screenName = userInfo['screen_name']

            console.log('looking for user with twitter id: ' + twitterId);
            pg.connect(config.database, function (err, client, done) {
                var handleError = function (err) {
                    if (!err) {return false}
                    if (client) {done(client)}
                    res.redirect('/')
                    return true
                }

                var handleSuccess = function () {
                    if (client) {done(client)}
                    req.session.user = twitterId
                    res.redirect('/')
                    return true
                }

                if (handleError(err)) { return }

                client.query('select 1 from "user" where id = $1', [twitterId], function (err, result) {
                    if (handleError(err)) { return }

                    if (result.rows.length === 0) {
                        console.log('inserting new user with id ' + twitterId)
                        client.query('insert into "user" (id, screen_name, access_token, access_token_secret) values ($1, $2, $3, $4)', [twitterId, screenName, token, tokenSecret], function (err, result) {
                            handleError(err) || handleSuccess()
                        })
                    } else {
                        console.log('updating user with id ' + twitterId)
                        client.query('update "user" set screen_name = $1, access_token = $2, access_token_secret = $3 where id = $4', [screenName, token, tokenSecret, twitterId], function (err, result) {
                            handleError(err) || handleSuccess()
                        })
                    }
                })
            })
        })
    })
})

app.post('/mute', function (req, res) {
    lookupUser(req.session.user, function (err, user) {
        if (err || !user) {
            res.sendStatus(400)
            console.log('Failed to find user: ' + err)
            return
        }

        var screenName = req.body.screen_name,
            duration = req.body.duration,
            startTime = new Date(),
            endTime = new Date(startTime.getTime() + duration * 1000)

        if (screenName.startsWith('@')) {
            screenName = screenName.substr(1)
        }

        mute(user.id, user.accessToken, user.accessTokenSecret, screenName, startTime, endTime, function (err, result) {
            if (err) {
                console.log(err)
            }
            res.redirect('/')
        })
    })
})

app.post('/unmute', function (req, res) {
    lookupUser(req.session.user, function (err, user) {
        if (err || !user) {
            res.sendStatus(400)
            console.log('Failed to find user: ' + err)
            return
        }

        var screenName = req.body.screen_name

        unmute(user.id, user.accessToken, user.accessTokenSecret, screenName, function (err, result) {
            if (err) {
                console.log(err)
            }
            res.redirect('/')
        })
    })
})

app.get('/events', function (req, res) {
    // let request last as long as possible
    req.socket.setTimeout(0)

    var loggedInUserId = req.session.user,
        messageCount = 0

    if (!loggedInUserId) {
        res.sendStatus(403)
        return
    }

    var unmuteCallback = function (userId, screenName) {
        console.log('unmuteCallback: ' + userId + ', ' + screenName)

        if (loggedInUserId === userId) {
            messageCount++
            res.write('event: unmute\n')
            res.write('id: ' + messageCount + '\n')
            res.write('data: ' + screenName + '\n\n')
        }
    }

    muteEvents.on('unmute', unmuteCallback)

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    })
    res.flushHeaders()

    req.on('close', function () {
        muteEvents.removeListener('unmute', unmuteCallback)
    })

})

console.log('listening on port ' + config.port)
app.listen(config.port)

setTimeout(tick, UPDATE_INTERVAL)
