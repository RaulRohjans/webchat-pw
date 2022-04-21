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
    database: process.env.DB_NAME
})

router.get('/ping', (req, res) => {
    //Redirect to main page if logged in
    res.status(200).json({"success": true})
});

router.get('/users', async (req, res) => {
    let queryResult

    //Return forbidden if not logged in
    if (!isLoggedIn(req))
        res.sendStatus(403)

    //If normal account get username only
    let user_list = []
    if(!isAdmin(req)){
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("SELECT idUser, username FROM user WHERE deleted = 0",
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if(queryResult.err){
            res.status(500).json({
                "success": false,
                "code": queryResult.err.code,
                "message": queryResult.err.sqlMessage
            })
            return
        }

        for(const usr of queryResult.result){
            user_list.push({
                idUser: usr.idUser,
                username: usr.username
            })
        }

    }
    else{ //else get all user info
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("SELECT * FROM user WHERE deleted = 0",
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if(queryResult.err){
            res.status(500).json({
                "success": false,
                "code": queryResult.err.code,
                "message": queryResult.err.sqlMessage
            })
            return
        }

        for(const usr of queryResult.result){
            user_list.push({
                idUser: usr.idUser,
                username: usr.username,
                email: usr.email,
                password: usr.password,
                creation_date: usr.creation_date,
                deleted: usr.deleted[0],
                isAdmin: usr.isAdmin[0]
            })
        }
    }

    res.status(200).json({users: user_list})
})


//Functions
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