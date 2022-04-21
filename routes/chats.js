const express = require('express')
const jwt = require("jsonwebtoken")
const multer = require('multer')
const path = require('path')
const mysql = require("mysql");
const router = express.Router()

//Start Mysql
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

router.get('/', (req, res) => {
    //Redirect to login page if not logged in
    if(!isLoggedIn(req)){
        res.redirect('/login')
        return
    }

    res.render("chats/chats")
});

router.get('/new', (req, res) => {
    //Redirect to login page if not logged in
    if(!isLoggedIn(req)){
        res.redirect('/login')
        return
    }

    res.render("chats/new-chat")
});

router.post('/new', upload.single('file_logo'), async (req, res) => {
    let queryResult;

    //Redirect to login page if not logged in
    if (!isLoggedIn(req)) {
        res.redirect('/login')
        return
    }

    //Check fields
    if (!req.body.txt_title || req.body.usrSelect.length < 1) {
        res.render("chats/new-chat", {errorMessage: "Please fill all the mandatory fields!"})
        return
    }

    //Generate ID
    let newID = 1;
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT idChat FROM chat ORDER BY idChat DESC LIMIT 1",
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).render("chats/new-chat", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        return
    }
    if(queryResult.result[0])
       newID = parseInt(queryResult.result[0].idChat) + 1


    //Check optional fields
    let description = req.body.txt_description
    let file = ''

    if(!description || description.trim() === '')
        description = null
    if(!req.file)
        file = null
    else
        file = req.file.filename

    //Add chat to DB
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("INSERT INTO chat(idChat, name, description, creation_date, image) VALUES(?, ?, ?, ?, ?)",
            [
                newID,
                req.body.txt_title.trim(),
                description,
                new Date(),
                file
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).render("chats/new-chat", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        return
    }

    //Add users to chat
    for(let i = 0; i < req.body.usrSelect.length; i++){

        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("INSERT INTO chat_user(idUser, idChat, useradded_date) VALUES(?, ?, ?)",
                [
                    req.body.usrSelect[0],
                    newID,
                    new Date()
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if (queryResult.err) {
            res.status(500).render("chats/new-chat", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
            return
        }
    }

    res.render("chats/new-chat", {successMessage: "Chat created successfully!"})
});

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


module.exports = router;