require('dotenv').config()

//Requires
const express = require('express')
const jwt = require('jsonwebtoken')
const mysql = require('mysql')
const app = express()

//Uses
app.use(express.static("public")) //Make static files available
app.use(express.urlencoded({ extended: true })) //Make body data accessible
app.use(express.json()) //Allow json parsing
app.set('view engine', 'ejs') //Use EJS

//Start Mysql
const connection = mysql.createConnection({
    host: 'localhost',
    port: '3306',
    user: 'root',
    password: '12345',
    database: 'pwchat'
})


//Routes
app.get('/', authenticateToken, (req, res) => {
    res.render("index", {text: 'world'})
})

app.get('/test', authenticateToken, (req, res) => {
    res.json(req.user);
})

const userRouter = require('./routes/users')
app.use('/users', userRouter)

const authRouter = require('./routes/auth')
app.use(authRouter)

//Functions
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if(token === undefined)
        return res.redirect('/login')

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if(err)
            return res.sendStatus(403)

        req.user = user;
        next()
    }, null)
}

app.listen(8080)