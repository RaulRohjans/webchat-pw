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
        connection.query("SELECT user.* FROM user INNER JOIN chat_user ON user.idUser = chat_user.idUser" +
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


let userObjs
let selectUserObjs
let chatObj
router.get('/:chatId/edit', authenticateToken, async (req, res) => {
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
    chatObj = queryResult.result[0]

    //Get all users from DB
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT idUser, username FROM user WHERE idUser != ? and deleted = 0",
            [
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).render("chats/edit-chat", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        return
    }
    userObjs = queryResult.result

    //Get all users in chat from DB
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT user.idUser, user.username FROM user INNER JOIN chat_user ON user.idUser = chat_user.idUser" +
            " INNER JOIN chat ON chat.idChat = chat_user.idChat WHERE chat_user.idUser != ? and chat_user.idChat = ? and user.deleted = 0 and chat.deleted = 0",
            [
                req.user.idUser,
                req.params.chatId
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).render("chats/edit-chat", {errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage})
        return
    }
    selectUserObjs = queryResult.result


    switch (req.query.code) {
        case "1211":
            res.render("chats/edit-chat", {
                successMessage: "Chat edited successfully!",
                users: userObjs,
                chat: chatObj,
                selectUsers: selectUserObjs
            })
            break
        default:
            res.render("chats/edit-chat", {users: userObjs, chat: chatObj, selectUsers: selectUserObjs})
            break
    }

});

router.post('/:chatId/edit', authenticateToken, upload.single('file_logo'), async (req, res) => {
    let queryResult;

    //Check fields
    if (!req.body.txt_title || req.body.usrSelect.length < 1) {
        res.render("chats/edit-chat", {
            errorMessage: "Please fill all the mandatory fields!",
            users: userObjs,
            chat: chatObj,
            selectUsers: selectUserObjs})
        return
    }

    //Check optional fields
    let description = req.body.txt_description
    let file = ''

    if(!description || description.trim() === '')
        description = null

    if(!req.file)
        file = null
    else
        file = req.file.filename

    //Edit chat in DB
    queryResult = await new Promise(async (resolve, reject) => {
        if(file)
            connection.query("UPDATE chat SET name = ?, description = ?, image =? WHERE idChat = ?",
                [
                    req.body.txt_title.trim(),
                    description.trim(),
                    file,
                    req.params.chatId
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        else
            connection.query("UPDATE chat SET name = ?, description = ? WHERE idChat = ?",
                [
                    req.body.txt_title.trim(),
                    description.trim(),
                    req.params.chatId
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
    })

    if (queryResult.err) {
        res.status(500).render("chats/edit-chat", {
            errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage,
            users: userObjs,
            chat: chatObj,
            selectUsers: selectUserObjs
        })
        return
    }

    //Get users that are in chat
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT idUser from chat_user WHERE idChat = ? and idUser != ?",
            [
                req.params.chatId,
                req.user.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).render("chats/edit-chat", {
            errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage,
            users: userObjs,
            chat: chatObj,
            selectUsers: selectUserObjs
        })
        return
    }
    let usersInChat = queryResult.result
    usersInChat = usersInChat.map(x => x.idUser.toString())
    //Add new users to chat
    let userList = []
    //Make sure userList is an array
    if(Array.isArray(req.body.usrSelect))
        userList = req.body.usrSelect
    else
        userList.push(req.body.usrSelect)

    //If there are no changes to the user list, no need to continue
    if(userList.length === usersInChat.length &&
        userList.slice().sort().every(function(value, index) {
            let sorted = usersInChat.slice().sort()
            return value === sorted[index];
        })
    ){
        res.render("chats/edit-chat", {
            successMessage: "Chat edited successfully!",
            users: userObjs, chat: chatObj,
            selectUsers: selectUserObjs
        })
        return
    }

    //Add new users
    let addUsers = userList.filter(x => !usersInChat.includes(x))
    for(let i = 0; i < addUsers.length; i++){
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("INSERT INTO chat_user(idUser, idChat, useradded_date) VALUES(?, ?, ?)",
                [
                    addUsers[i],
                    req.params.chatId,
                    new Date()
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if (queryResult.err) {
            res.status(500).render("chats/edit-chat", {
                errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage,
                users: userObjs,
                chat: chatObj,
                selectUsers: selectUserObjs
            })
            return
        }
    }


    //Remove old users
    let removeUsers = usersInChat.filter(x => !userList.includes(x))
    for(let i = 0; i < removeUsers.length; i++){
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("DELETE FROM chat_user WHERE idUser = ?",
                [
                    removeUsers[i]
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if (queryResult.err) {
            res.status(500).render("chats/edit-chat", {
                errorMessage: queryResult.err.code + ":\n" + queryResult.err.sqlMessage,
                users: userObjs,
                chat: chatObj,
                selectUsers: selectUserObjs})
            return
        }
    }

    res.redirect('/chats/' + req.params.chatId + '/edit?code=1211')
});

router.post('/:chatId/leave', authenticateToken, async (req, res) => {
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

    if(queryResult.err) {
        res.sendStatus(500)
        return
    }

    if (queryResult.result[0].chatUserCount < 1) {
        res.sendStatus(404)
        return
    }

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

    if(queryResult.err) {
        res.sendStatus(500)
        return
    }

    if (queryResult.result[0].chatUserCount < 1) {
        res.sendStatus(404)
        return
    }

    //Remove user from chat
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("DELETE FROM chat_user WHERE idUser = ? and idChat = ?",
            [
                req.user.idUser,
                req.params.chatId
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err) {
        res.sendStatus(500)
        return
    }

    res.sendStatus(200)
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

        if(user.deleted)
            return res.redirect('/login?code=2834')

        req.user = user;
        next()
    }, null)
}


module.exports = router;