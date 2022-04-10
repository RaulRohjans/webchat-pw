require('dotenv').config()

const express = require('express')
const jwt = require('jsonwebtoken')
const app = express()

app.use(express.urlencoded({ extended: true })) //Make body data accessible
app.use(express.json()) //Allow json parsing

//Routes
app.get('/', (req, res) => {
    res.sendStatus(200)
})
let refreshTokens = []

app.post('/signup', (req, res) => {

})

app.post('/login', (req, res) => {
    //Authenticate User
    const user = {
        id: 1,
        username: req.body.username,
        email: req.body.email,
        pwHash: req.body.pwHash
    }

    //Create Tokens
    const accessToken = generateAccessToken(user)
    const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, null, null)

    //Save refreshToken in the DB
    refreshTokens.push(refreshToken)

    //Send tokens response
    res.json({ accessToken: accessToken, refreshToken: refreshToken })
})

app.post('/logout', (req, res) => {
    //Delete token from DB
    refreshTokens = refreshTokens.filter(token => token !== req.body.token)
    res.sendStatus(204)
})

app.post('/token', (req, res) => {
    const refreshToken = req.body.token

    if(refreshToken == null)
        return res.sendStatus(401)

    if(refreshTokens.includes(refreshToken)) //Check if Token exists in DB
        return res.sendStatus(403)

    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, user) => {
        if(err)
            return res.sendStatus(403)

        const accessToken = generateAccessToken({
            id: user.id,
            username: user.username,
            email: user.email,
            pwHash: user.pwHash
        })
        res.json({ accessToken: accessToken })
    }, null)
})

//Functions
function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '20s' }, null)
}

app.listen(8081)