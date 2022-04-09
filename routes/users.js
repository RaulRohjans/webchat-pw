const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
   res.send('Users');
});

router.post('/new', (req, res) => {
    res.json({ users: 'new' });
});

module.exports = router;