const express = require('express');
const jwt = require("jsonwebtoken");
const mysql = require("mysql");
const multer = require("multer");
const path = require("path");
const crypto = require("crypto");
const router = express.Router();


const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PW,
    database: process.env.DB_NAME
})

const storage = multer.diskStorage({
    destination: (req, file, callback) => {
        callback(null, 'public/user-images')
    },
    filename: (req, file, callback) => {
        callback(null, Date.now() + path.extname(file.originalname))
    }
})
const upload = multer({
    storage: storage,
    fileFilter: (req, file, callback) => {
        const ext = path.extname(file.originalname);
        if(ext !== '.png' && ext !== '.jpg' && ext !== '.gif' && ext !== '.jpeg') {
            return callback(new Error('Only images are allowed'))
        }
        callback(null, true)
    },
})

router.get('/', authenticateToken, (req, res) => {
    switch (req.query.code) {
        case "5937":
            res.render("settings/settings", {errorMessage: "Invalid Image!", user: req.user})
            break
        case '3915':
            res.render("settings/settings", {successMessage: "User Settings Updated!", user: req.user})
            break
        default:
            res.render("settings/settings", { user: req.user })
            break
    }

});

router.post('/', authenticateToken, async (req, res) => {
    let queryResult

    //Check inputs
    if (!req.body.txt_username) {
        res.render("settings/settings", {errorMessage: "Please insert a valid username!", user: req.user})
        return
    }

    if ((!req.body.txt_firstName && req.body.txt_lastName) || (req.body.txt_firstName && !req.body.txt_lastName)) {
        res.render("settings/settings", {
            errorMessage: "Please insert both a First Name and Last Name!",
            user: req.user
        })
        return
    }

    if(req.body.txt_phone) {
        if (isNaN(req.body.txt_phone.substring(1)) || req.body.txt_phone.substring(0, 1) !== '+') {
            res.render("settings/settings", {errorMessage: "Please insert a valid phone number! (ex: +351963258741)", user: req.user})
            return
        }
    }

    if ((!req.body.txt_pass && req.body.txt_repPass) || (req.body.txt_pass && !req.body.txt_repPass)){
        res.render("settings/settings", {errorMessage: "Please fill both password fields!", user: req.user})
        return
    }

    if (!req.body.txt_email) {
        res.render("settings/settings", {errorMessage: "Please insert a valid email!", user: req.user})
        return
    }

    //Check optional fields
    let first_name = req.body.txt_firstName
    let last_name = req.body.txt_lastName
    let phone = req.body.txt_phone
    let birthdate = req.body.txt_birthdate
    let password = ''

    if(!first_name || first_name.trim() === ''){
        first_name = null
        last_name = null
    }

    if(!phone || phone.trim() === '')
        phone = null

    if(!birthdate || birthdate.trim() === '')
        birthdate = null

    if(req.body.txt_pass && req.body.txt_repPass){
        if(req.body.txt_pass === req.body.txt_repPass){
            password = crypto.createHash('sha256').update(req.body.txt_pass.trim()).digest('hex')
        }
        else{
            res.render("settings/settings", {errorMessage: "Passwords don't match!", user: req.user})
            return
        }
    }
    else{
        password = req.user.password
    }

    //If username is different, check availability
    if (req.body.txt_username !== req.user.username) {
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("SELECT COUNT(*) as count FROM user WHERE username = ? and deleted = 0",
                [
                    req.body.txt_username
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if(queryResult.err){
            res.status(500).render("settings/settings", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage, user: req.user})
            return
        }
        if(queryResult.result[0].count > 0){
            res.render("settings/settings", {errorMessage: "This username is already in use!", user: req.user})
            return
        }
    }

    //If email is different, check availability
    if (req.body.txt_email !== req.user.email) {
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("SELECT COUNT(*) as count FROM user WHERE email = ? and deleted = 0",
                [
                    req.body.txt_email
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if(queryResult.err){
            res.status(500).render("settings/settings", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage, user: req.user})
            return
        }
        if(queryResult.result[0].count > 0){
            res.render("settings/settings", {errorMessage: "This email is already in use!", user: req.user})
            return
        }
    }

    //Update user info
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("UPDATE user SET username = ?, email = ?, password = ?, first_name = ?, last_name = ?," +
            "phone = ?, birthdate = ?, color = ? WHERE idUser = ?",
            [
                req.body.txt_username,
                req.body.txt_email,
                password,
                first_name,
                last_name,
                phone,
                birthdate,
                req.body.inputColor,
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("settings/settings", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage, user: req.user})
        return
    }

    //Update token
    await updateToken(req.user.idUser, res)

    res.redirect('/settings?code=3915');
});

router.post('/image', authenticateToken, upload.single('image'), async (req, res) => {
    //Check image
    if (!req.file) {
        res.redirect('/settings?code=5937')
        return
    }

    //Add image to DB
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("UPDATE user SET image = ? WHERE idUser = ?",
            [
                req.file.filename,
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

    //Update token
    await updateToken(req.user.idUser, res)

    res.redirect('/settings')
});

router.delete('/', authenticateToken, async (req, res) => {
    //Delete User
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("UPDATE user SET deleted = 1 WHERE idUser = ?",
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

    //Clear token
    res.clearCookie('AuthToken') //Remove cookie from browser
    res.sendStatus(200)
});

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

function generateAccessToken(user) {
    return jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: process.env.USER_EXPIRE_TIME }, null)
}

async function updateToken(userId, res) {
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM user WHERE idUser = ?",
            [
                userId
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    let userObj = {
        idUser: queryResult.result[0].idUser,
        username: queryResult.result[0].username,
        email: queryResult.result[0].email,
        password: queryResult.result[0].password,
        first_name: queryResult.result[0].first_name,
        last_name: queryResult.result[0].last_name,
        phone: queryResult.result[0].phone,
        birthdate: queryResult.result[0].birthdate,
        image: queryResult.result[0].image,
        color: queryResult.result[0].color,
        creation_date: queryResult.result[0].creation_date,
        deleted: queryResult.result[0].deleted[0],
        isAdmin: queryResult.result[0].isAdmin[0]
    }

    const accessToken = generateAccessToken(userObj)
    res.cookie('AuthToken', accessToken)
}


module.exports = router;