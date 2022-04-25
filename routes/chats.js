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

router.get('/', authenticateToken, async (req, res) => {
    //Get chats from DB
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM chat inner join chat_user on chat.idChat=chat_user.idChat WHERE chat_user.idUser" +
            " = ? and chat.deleted = 0",
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


    res.render("chats/chats", {chats: queryResult.result})
});

router.get('/new', authenticateToken, async (req, res) => {
    //Redirect to login page if not logged in
    if (!isLoggedIn(req)) {
        res.redirect('/login')
        return
    }

    //Get users from DB
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT idUser, username FROM user WHERE idUser != ? and deleted = 0",
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


    res.render("chats/new-chat", {users: queryResult.result})
});

router.post('/new', authenticateToken, upload.single('file_logo'), async (req, res) => {
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
    let userList = req.body.usrSelect;
    userList.push(req.user.idUser);
    for(let i = 0; i < req.body.usrSelect.length; i++){

        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("INSERT INTO chat_user(idUser, idChat, useradded_date) VALUES(?, ?, ?)",
                [
                    userList[i],
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

router.get('/:chatId', authenticateToken, async (req, res) => {

    //Check if chat exists
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM chat where idChat = ? and deleted = 0",
            [
                req.params.chatId
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err || queryResult.result.length < 1) {
        res.redirect('/chats')
        return
    }
    let chatObj = queryResult.result[0]

    //Check if user is in chat
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT COUNT(*) as chatUserCount FROM chat_user where idChat = ? and idUser = ?",
            [
                req.params.chatId,
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err || queryResult.result[0].chatUserCount < 1) {
        res.redirect('/chats')
        return
    }

    //Get users in chat
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM user INNER JOIN chat_user ON user.idUser = chat_user.idUser" +
            " INNER JOIN chat ON chat_user.idChat = chat.idChat" +
            " WHERE chat_user.idChat = ? and chat.deleted = 0 and user.deleted = 0",
            [
                req.params.chatId
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err || queryResult.result.length < 1) {
        res.redirect('/chats')
        return
    }
    let userObjs = queryResult.result

    res.render("chats/chat", {chat: chatObj, users: userObjs})
})

router.get('/:chatId/leave', authenticateToken, (req, res) => {
    //Check if chat exists


    //Display error when user is not in chat

    res.send('Leave chat ' + req.params.chatId);
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

function authenticateToken(req, res, next) {
    if(!req.cookies)
        return res.redirect('/login')

    if(!req.cookies['AuthToken'])
        return res.redirect('/login')


    jwt.verify(req.cookies['AuthToken'], process.env.ACCESS_TOKEN_SECRET, (err, user) => {
        if(err)
            return res.redirect('/login?code=1011')

        req.user = user;
        next()
    }, null)
}


module.exports = router;