require('dotenv').config()

//Requires
const express = require('express')
const jwt = require('jsonwebtoken')
const User = require('./public/js/user.js')
const app = express()

//Uses
app.use(express.static("public")) //Make static files available
app.use(express.urlencoded({ extended: true })) //Make body data accessible
app.use(express.json()) //Allow json parsing
app.set('view engine', 'ejs') //Use EJS


//Routes
app.get('/', (req, res) => {
    res.render("index", {text: 'world'})
})

app.get('/test', authenticateToken, (req, res) => {
    res.json(req.user);
})

const userRouter = require('./routes/users')
app.use('/users', userRouter)


//Functions
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if(token == null)
        return res.sendStatus(401)

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if(err)
            return res.sendStatus(403)

        req.user = user;
        next()
    }, null)
}

app.listen(8080)