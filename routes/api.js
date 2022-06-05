require('dotenv').config()

const express = require('express')
const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const cookieParser = require('cookie-parser');
const mysql = require("mysql")
const router = express.Router()

router.use(cookieParser());

//Start Mysql
const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME,
    charset: 'utf8mb4'
})

router.get('/ping', (req, res) => {
    //Redirect to main page if logged in
    res.status(200).json({"success": true})
});

router.get('/private-users', authenticateToken, async (req, res) => {
    //Get users with no private chat with current user
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT idUser, first_name, last_name, username, image FROM user WHERE idUser != ? and deleted = 0 ORDER BY username",
            [
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.sendStatus(500)
        return
    }

    res.status(200).json(JSON.stringify(queryResult.result))
})

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

function isLoggedIn(req) {
    if (!req.cookies)
        return false

    if (!req.cookies['AuthToken'])
        return false

    //Check if cookie is valid
    return jwt.verify(req.cookies['AuthToken'], process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        return !err;
    }, null)
}

function isAdmin(req) {
    if (!req.cookies)
        return false

    if (!req.cookies['AuthToken'])
        return false


    //Check if cookie is valid
    return jwt.verify(req.cookies['AuthToken'], process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        return user.isAdmin;
    }, null)
}

function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.USER_EXPIRE_TIME }, null)
}

module.exports = router