const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();

app.use(express.static("public")); //Make static files available
app.use(express.urlencoded({ extended: true })); //Make body data accessible
app.use(express.json); //Allow json parsing
app.set('view engine', 'ejs'); //Use EJS

//Routes
app.get('/', (req, res) => {
    res.render("index", {text: 'world'})
});

app.post('/login', (req, res) => {
    //Authenticate User
    const username = req.body.username;
    const user = { name: username };

    const accessToken = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET);
    res.json({ Token: accessToken });
});

const userRouter = require('./routes/users');
app.use('/users', userRouter);

app.listen(8080);