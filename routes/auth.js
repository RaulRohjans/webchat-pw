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

router.get('/login', (req, res) => {
    //Redirect to main page if logged in
    if(isLoggedIn(req)){
        res.redirect('/')
        return
    }

    switch (req.query.code) {
        case "1001":
            res.render("auth/login", {successMessage: "Account created successfully!"})
            break
        case "1101":
            res.render("auth/login", {successMessage: "You have logged out."})
            break
        case "1102":
            res.render("auth/login", {errorMessage: "You are not logged in."})
            break
        case "1011":
            res.render("auth/login", {errorMessage: "Your session has expired."})
            break
        default:
            res.render("auth/login")
            break
    }
});

router.post('/login', async (req, res) => {
    let queryResult

    //Redirect to main page if logged in
    if (isLoggedIn(req))
        res.redirect('/')

    //Check if fields are filled
    if (!req.body.inputEmail || !req.body.inputPassword) {
        res.status(400).render("auth/login",
            {
                errorMessage: "Please fill in the missing fields.",
                inputEmail: req.body.inputEmail
            })
        return
    }


    //Get user account
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM user WHERE email = ?",
            [
                req.body.inputEmail
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("auth/login", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        throw new queryResult.err
    }
    //Error if it does not exist
    if(queryResult.result.length < 1){
        res.status(400).render("auth/login",
            {
                errorMessage: "Invalid login credentials.",
                inputEmail: req.body.inputEmail
            })
        return
    }

    //Check if password is correct
    if(crypto.createHash('sha256').update(req.body.inputPassword).digest('hex') !==
        queryResult.result[0].password){
        res.status(400).render("auth/login",
            {
                errorMessage: "Invalid login credentials.",
                inputEmail: req.body.inputEmail
            })
        return
    }

    let userObj = {
        idUser: queryResult.result[0].idUser,
        username: queryResult.result[0].username,
        email: queryResult.result[0].email,
        password: queryResult.result[0].password,
        creation_date: queryResult.result[0].creation_date
    }

    //Check if user token has expired and stored in DB
    let storedToken
    if (req.cookies){
        if (!req.cookies['AuthToken']){
            let isValid = jwt.verify(req.cookies['AuthToken'], process.env.ACCESS_TOKEN_SECRET, (err, user) => {
                return !!err.expiredAt;
            }, null)

            //If token is expired, check if there is an entry in the DB
            if(isValid){
                let queryResult = await new Promise(async (resolve, reject) => {
                    connection.query("SELECT token FROM token " +
                        "INNER JOIN user ON user.idUser = token.idToken WHERE user.email = ?",
                        [
                            req.body.inputEmail
                        ],
                        (err, result, fields) => {
                            resolve({err: err, result: result})
                        })
                })

                if(queryResult.err){
                    res.status(500).render("auth/login", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
                    throw new queryResult.err
                }
                //Error if it does not exist
                if(queryResult.result.length > 0){
                    storedToken = queryResult.result.token
                }
            }
        }
    }

    if(storedToken){ //If there is a token, generate a new temp one
        const accessToken = generateAccessToken(userObj)
        res.cookie('AuthToken', accessToken)
    }
    else{ //Create new tokens
        /* Generate tokens and return them */
        const accessToken = generateAccessToken(userObj)
        const refreshToken = jwt.sign(userObj, process.env.REFRESH_TOKEN_SECRET, null, null)

        //Save refreshToken in the DB
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("INSERT INTO refresh_token(token, user, creation_date) VALUES(?, ?, ?)",
                [
                    refreshToken,
                    queryResult.result[0].idUser,
                    new Date()
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if(queryResult.err){
            res.status(500).render("auth/login", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
            throw new queryResult.err
        }

        //Save token in cookie
        res.cookie('AuthToken', accessToken)
        /*---------------------------------*/
    }
    res.redirect('/')
});

router.get('/register', (req, res) => {
    //Redirect to main page if logged in
    if(isLoggedIn(req)){
        res.redirect('/')
    }
    res.render("auth/register")
});

router.post('/register', async (req, res) => {
    let queryResult

    //Redirect to main page if logged in
    if (isLoggedIn(req))
        res.redirect('/')

    //Check if all the fields have data
    if(!req.body.txt_email || !req.body.txt_username || !req.body.txt_pw || !req.body.txt_rePw){
        res.status(400).render("auth/register",
            {
                errorMessage: "Please fill in the missing fields.",
                txt_username: req.body.txt_username,
                txt_email: req.body.txt_email
            })
        return
    }

    //Check if username is in use
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT COUNT(*) as usrCount FROM user WHERE username = ?",
            [
                req.body.txt_username
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("auth/register", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        throw new queryResult.err
    }
    if (parseInt(queryResult.result[0].usrCount) > 0) {
        res.status(400).render("auth/register",
            {
                errorMessage: "This username is already in use!",
                txt_username: req.body.txt_username,
                txt_email: req.body.txt_email
            })
        return
    }


    //Check if email is in use
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT COUNT(*) as usrCount FROM user WHERE email = ?",
            [
                req.body.txt_email
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("auth/register", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        connection.end()
        throw new queryResult.err
    }
    if (parseInt(queryResult.result[0].usrCount) > 0) {
        res.status(400).render("auth/register",
            {
                errorMessage: "This email address is already in use!",
                txt_username: req.body.txt_username,
                txt_email: req.body.txt_email
            })
        return
    }


    //Check if passwords don't match
    if (req.body.txt_pw !== req.body.txt_rePw){
        res.status(400).render("auth/register",
            {
                errorMessage: "The passwords don\'t match!",
                txt_username: req.body.txt_username,
                txt_email: req.body.txt_email
            })
        return
    }


    //Add new user to DB
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("INSERT INTO user(username, email, password, creation_date) VALUES(?, ?, ?, ?)",
            [
                req.body.txt_username,
                req.body.txt_email,
                crypto.createHash('sha256').update(req.body.txt_pw).digest('hex'),
                new Date()
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("auth/register", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        throw new queryResult.err
    }

    res.redirect('/login?code=1001')
});

router.get('/logout', async (req, res) => {
    if(!req.cookies){
        res.redirect('/login?code=1102')
        return
    }

    if(!req.cookies['AuthToken']) {
        res.redirect('/login?code=1102')
        return
    }


    //Delete token from DB
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("DELETE FROM refresh_token WHERE token = ?",
            [
                req.cookies['AuthToken']
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })
    if(queryResult.err){
        res.status(500).send("Error 500")
        throw new queryResult.err
    }

    res.clearCookie('AuthToken') //Remove cookie from browser
    res.redirect('/login?code=1101')
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

function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.USER_EXPIRE_TIME }, null)
}

module.exports = router