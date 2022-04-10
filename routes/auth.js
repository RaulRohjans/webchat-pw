const express = require('express');
const jwt = require("jsonwebtoken");
const router = express.Router();


router.get('/login', (req, res) => {
    //Redirect to main page if logged in
    if(isLoggedIn(req))
        res.redirect('/')

    res.render("auth/login", {text: 'world'})
});

router.post('/register', (req, res) => {
    //Redirect to main page if logged in
    if(isLoggedIn(req))
        res.redirect('/')

    res.render("auth/register", {text: 'world'})
});


//Functions
function isLoggedIn(req) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    return token !== undefined;
}

module.exports = router