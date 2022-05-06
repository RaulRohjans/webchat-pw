require('dotenv').config()

//Requires
const express = require('express')
const jwt = require('jsonwebtoken')
const mysql = require('mysql')
const cookieParser = require('cookie-parser');
const app = express()

//Uses
app.use(express.static("public")) //Make static files available
app.use(express.urlencoded({ extended: true })) //Make body data accessible
app.use(express.json()) //Allow json parsing
app.use(cookieParser()); //Allow cookie parsing
app.set('view engine', 'ejs') //Use EJS

//Start Mysql
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME
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