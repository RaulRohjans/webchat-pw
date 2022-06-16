require('dotenv').config()

//Requires
const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const mysql = require('mysql')
const cookieParser = require('cookie-parser');
const io = require("socket.io")(8081, {
    cors: {
        origin: ['http://localhost:8080'],
    },
});

//Uses
app.use(express.static("public")) //Make static files available
app.use(express.urlencoded({ extended: true })) //Make body data accessible , limit: '100mb', parameterLimit: 1000000
app.use(express.json()) //Allow json parsing
app.use(cookieParser()); //Allow cookie parsing
app.set('view engine', 'ejs') //Use EJS

//Start Mysql
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
})

//Start Socket.io
io.on("connection", socket => {
    socket.on('send-message', (message, image, user, room) => {
        //Get user ID from username
        connection.query("SELECT idUser from user where username = ? and deleted = 0;",
            [
                user
            ],
            (err, result, fields) => {
                if(!err){
                    //Save message in DB
                    if(!image){
                        connection.query("INSERT INTO message (text, idUser, idChat, sent_date, deleted) VALUES (?, ?, ?, ?, 0)",
                            [
                                message,
                                result[0].idUser,
                                room,
                                new Date()
                            ],
                            (err, res, fields) => {
                                if(err){
                                    console.log("ERROR: An error has occurred when saving a message. " + err)
                                }
                                else{
                                    socket.to(room).emit('receive-message', message, result[0].idUser)
                                }
                            })
                    }
                    else {
                        connection.query("INSERT INTO message (image, idUser, idChat, sent_date, deleted) VALUES (?, ?, ?, ?, 0)",
                            [
                                image,
                                result[0].idUser,
                                room,
                                new Date()
                            ],
                            (err, res, fields) => {
                                if(err){
                                    console.log("ERROR: An error has occurred when saving a message. " + err)
                                }
                                else{
                                    socket.to(room).emit('receive-image', image, result[0].idUser)
                                }
                            })
                    }
                }
            })

    })

    socket.on('join-room', (room, userID) => {
        console.log(userID + " joined room " + room)
        socket.join(room)
        socket.server.in(room).emit('user-join', userID)
    })
})

//Routes
app.get('/', authenticateToken, async (req, res) => {
    //Get users with no private chat with current user
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM user WHERE idUser != ? and deleted = 0 ORDER BY username",
            [
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).send("An error has occurred while loading the page.\n" + queryResult.err.code + ":\n"
            + queryResult.err.sqlMessage)
        return
    }

    res.render("index", {username: req.user.username, isAdmin: req.user.isAdmin, prvChatUsrs: queryResult.result})
})

app.get('/redirect', authenticateToken, async (req, res) => {
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
    await delay(1000)
    if(!req.query.url){
        res.redirect('/')
    }
    else{
        if(req.query.url.substring(0, 1) === '/')
            res.redirect(req.query.url)
        else
            res.redirect('/' + req.query.url)
    }
})

const authRouter = require('./routes/auth')
app.use(authRouter)

const apiRouter = require('./routes/api')
app.use('/api', apiRouter)

const chatRouter = require('./routes/chats')
app.use('/chats', chatRouter)

const settingsRouter = require('./routes/settings')
app.use('/settings', settingsRouter)



//Functions
function authenticateToken(req, res, next) {
    if(!req.cookies)
        return res.redirect('/login')

    if(!req.cookies['AuthToken'])
        return res.redirect('/login')


    jwt.verify(req.cookies['AuthToken'], process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if(err)
            return res.redirect('/login?code=1011')

        if(user.deleted)
            return res.redirect('/login?code=2834')

        req.user = user;
        next()
    }, null)
}

app.listen(8080)