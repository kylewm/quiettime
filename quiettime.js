var fs = require('fs'),
    url = require('url'),
    express = require('express'),
    expressSession = require('express-session'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    MongoClient = require('mongodb').MongoClient ,
    MongoStore = require('connect-mongo')(expressSession),
    ObjectID = require('mongodb').ObjectID,
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

console.log('connecting to MongoDB: ' + config.database)
MongoClient.connect(config.database, function (err, db) {
    if (err) {
        console.log('error connecting to MongoDB: ' + err)
        return;
    }

    app.use(expressSession({
        secret: config.sessionSecret,
        resave: false,
        saveUninitialized: false,
        store: new MongoStore({db: db}),
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

    function lookupUser(userId, cb) {
        db.collection('users')
            .find(ObjectID(userId))
            .limit(1)
            .next(cb);
    }

    function mute(user, screenName, startTime, endTime, cb) {
        oauth.post(API_BASE + 'mutes/users/create.json', user.accessToken, user.accessTokenSecret, {screen_name: screenName}, function (err, data, response) {
            if (err) {
                console.log(err)
                cb(err, null)
                return
            }

            db.collection('users').updateOne({_id: user._id}, {
                '$set': {
                    ['mutes.' + screenName]: {
                        startTime: startTime,
                        endTime: endTime,
                    }
                },
            }, cb)

        })
    }

    function unmute(user, screenName, cb) {
        console.log('attempting to unmute ' + screenName)
        oauth.post(API_BASE + 'mutes/users/destroy.json', user.accessToken, user.accessTokenSecret, {screen_name: screenName}, function (err, data, response) {
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
                    cb(err, null)
                    return
                }
            }

            console.log('removing ' + screenName + ' from list of mutes')
            db.collection('users').updateOne({_id: user._id}, {
                '$unset': {
                    ['mutes.' + screenName]: '',
                },
            }, cb)
        })
    }

    // search all users for muted friends that have expired
    function tick() {
        db.collection('users').find().forEach(function (user) {
            if (user.mutes) {
                for (var screenName in user.mutes) {
                    var endTime = user.mutes[screenName].endTime
                    if (endTime && endTime.getTime() <= Date.now()) {
                        unmute(user, screenName, function (err, data, response) {
                            // unmute successful
                            console.log(user.screenName + ": unmuted " + screenName);
                        });
                    }
                }
            }
        })

        setTimeout(tick, UPDATE_INTERVAL)
    }

    app.get('/', function (req, res) {
        if (req.session.user) {
            lookupUser(req.session.user, function (err, user) {
                if (err || !user) {
                    res.sendStatus(400)
                    console.log('Failed to find user: ' + err)
                    return
                }

                res.render('logged-in', {
                    title: user.screenName,
                    user: user,
                })
            })
        }
        else {
            res.render('logged-out', {
            })
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

                db.collection('users').findOneAndUpdate({
                    twitterId: twitterId,
                }, {
                    '$set': {
                        twitterId: twitterId,
                        screenName: screenName,
                        userInfo: userInfo,
                        accessToken: token,
                        accessTokenSecret: tokenSecret,
                    },
                }, {
                    // create a new user if one does not already exist
                    upsert: true,
                    // return the updated (or newly created object) as value
                    returnOriginal: false,
                }, function(err, result) {
                    if (err) {
                        console.log(err)
                        res.sendStatus(400)
                        return
                    }
                    req.session.user = result.value._id
                    res.redirect('/')
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

            mute(user, screenName, startTime, endTime, function (err, result) {
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

            unmute(user, screenName, function (err, result) {
                if (err) {
                    console.log(err)
                }
                res.redirect('/')
            })
        })
    })

    console.log('listening on port ' + config.port)
    app.listen(config.port)

    setTimeout(tick, UPDATE_INTERVAL)
})
