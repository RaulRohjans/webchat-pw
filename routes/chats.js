const express = require('express')
const jwt = require("jsonwebtoken")
const multer = require('multer')
const path = require('path')
const mysql = require("mysql")
const sharp = require("sharp");
const fs = require("fs");
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
        callback(null, 'temp-' + Date.now() + path.extname(file.originalname))
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
    //Get group chats from DB
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT * FROM chat inner join chat_user on chat.idChat=chat_user.idChat WHERE chat_user.idUser" +
            " = ? and chat.deleted = 0 and chat.private = 0",
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
    const pubChats = queryResult.result;

    //Get private chats from DB (without current user info)
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT user.*, chat.idChat FROM user " +
            "INNER JOIN chat_user ON chat_user.idUser = user.idUser " +
            "INNER JOIN chat ON chat_user.idChat = chat.idChat " +
            "WHERE chat.deleted = 0 " +
            "AND user.deleted = 0 " +
            "AND chat_user.idUser != ? " +
            "AND chat_user.idChat IN (select chat_user.idChat from chat_user inner join chat on chat.idChat = chat_user.idChat where idUser = ? and chat.private = 1) " +
            "ORDER BY user.username",
            [
                req.user.idUser,
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
    const prvChats = queryResult.result;

    res.render("chats/chats", {publicChats: pubChats, privateChats: prvChats})
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

    switch (req.query.code){
        case '5911':
            res.render("chats/new-chat", {users: queryResult.result, errorMessage: 'The image must be lower than 100MB!'})
            break;
        case '5938':
            res.render("chats/new-chat", {users: queryResult.result, errorMessage: 'There has been an error when processing your request.'})
            break;
        default:
            res.render("chats/new-chat", {users: queryResult.result})
            break;
    }
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
    else{
        //Parse cropData and validate it
        const cropData = JSON.parse(req.body.cropData)

        //Crop image and save it
        const imageName = req.file.filename.replace('temp-', '')
        try{
            //fetch temp image and crop it
            let error = false
            await sharp("public/user-images/" + req.file.filename, {animated: true})
                .extract({
                    left: parseInt(cropData.x),
                    top: parseInt(cropData.y),
                    width: parseInt(cropData.width),
                    height: parseInt(cropData.height)
                })
                .toFile("public/user-images/" + imageName, (err) => {
                    if (err) error = true

                    //Remove temp image
                    fs.unlink("public/user-images/" + req.file.filename, (err) => {
                        if (err) {
                            console.error(err)
                            res.redirect('/chats/new?code=5938')
                            return
                        }
                    })
                })

            if(error){
                res.redirect('/chats/new?code=5938')
                return
            }
        }
        catch (Exception){
            console.log(Exception)
            res.redirect('/chats/new?code=5938')
            return
        }

        file = imageName
    }

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

router.get('/new-private/:idUser', authenticateToken, async (req, res) => {
    //Check if user id is valid
    let queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT count(*) as cnt from user WHERE idUser = ? and deleted = 0",
            [
                req.params.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).send("An error has occurred while creating the chat " +
            queryResult.err.code + ":\n" + queryResult.err.sqlMessage)
        return
    }
    if(queryResult.result[0].cnt < 1) {
        res.redirect('/chats');
    }

    //Check if there is a private chat with the current user
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("SELECT chat_user.idChat as idChat FROM chat_user WHERE " +
            "chat_user.idChat IN (select chat_user.idChat from chat_user inner join chat on chat.idChat = chat_user.idChat where chat_user.idUser = ? and chat.private = 1) " +
            "and chat_user.idUser = ?",
            [
                req.user.idUser,
                req.params.idUser
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if(queryResult.err){
        res.status(500).send("An error has occurred while creating the chat " +
            queryResult.err.code + ":\n" + queryResult.err.sqlMessage)
        return
    }
    if(queryResult.result.length > 0){
        res.redirect('/chats/' + queryResult.result[0].idChat);
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
        res.status(500).send("An error has occurred while creating the chat " +
            queryResult.err.code + ":\n" + queryResult.err.sqlMessage)
        return
    }
    if(queryResult.result[0])
        newID = parseInt(queryResult.result[0].idChat) + 1

    //Create new chat
    queryResult = await new Promise(async (resolve, reject) => {
        connection.query("INSERT INTO chat(idChat, creation_date, private) values(?, ? ,1)",
            [
                newID,
                new Date()
            ],
            (err, result, fields) => {
                resolve({err: err, result: result})
            })
    })

    if (queryResult.err) {
        res.status(500).send("An error has occurred while creating the chat.\n" + queryResult.err.code + ":\n"
            + queryResult.err.sqlMessage)
        return
    }


    //Add both users to new chat
    for(const idUser of [req.user.idUser, req.params.idUser]){
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("INSERT INTO chat_user(idUser, idChat, useradded_date) VALUES(?, ?, ?)",
                [
                    idUser,
                    newID,
                    new Date()
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if (queryResult.err) {
            res.status(500).send("An error has occurred while creating the chat.\n" + queryResult.err.code + ":\n"
                    + queryResult.err.sqlMessage)
            return
        }
    }

    res.redirect('/chats/' + newID);
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

    if(!chatObj.private[0]){
        res.render("chats/chat", {chat: chatObj, users: userObjs})
    }
    else{
        let toUser = userObjs.filter(x => x.idUser !== req.user.idUser)

        //Get all users
        queryResult = await new Promise(async (resolve, reject) => {
            connection.query("SELECT * FROM user WHERE deleted = 0 and idUser != ?",
                [
                    req.user.idUser
                ],
                (err, result, fields) => {
                    resolve({err: err, result: result})
                })
        })

        if (queryResult.err) {
            res.redirect('/chats')
            return
        }

        res.render("chats/chat-private", {chat: chatObj, toUser: toUser[0], users: queryResult.result})
    }
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
    else{
        //Parse cropData and validate it
        const cropData = JSON.parse(req.body.cropData)

        //Crop image and save it
        const imageName = req.file.filename.replace('temp-', '')
        try{
            //fetch temp image and crop it
            let error = false
            await sharp("public/user-images/" + req.file.filename, {animated: true})
                .extract({
                    left: parseInt(cropData.x),
                    top: parseInt(cropData.y),
                    width: parseInt(cropData.width),
                    height: parseInt(cropData.height)
                })
                .toFile("public/user-images/" + imageName, (err) => {
                    if (err) {
                        error = true
                        return
                    }

                    //Remove temp image
                    fs.unlink("public/user-images/" + req.file.filename, (err) => {
                        if (err) {
                            console.error(err)
                            error = true
                        }
                    })
                })

            if(error){
                res.redirect('/chats/new?code=5938')
                return
            }
        }
        catch (Exception){
            console.log(Exception)
            res.redirect('/chats/new?code=5938')
            return
        }

        file = imageName
    }

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