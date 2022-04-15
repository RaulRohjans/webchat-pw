const express = require('express');
const jwt = require("jsonwebtoken");
const router = express.Router();

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