const express = require('express');
const cookieParser = require('cookie-parser');
const router = express.Router();

router.use(cookieParser());

router.use((req, res, next) => {
    console.log('cookie set');
    res.cookie('myCookie', 'cookieValue3', {
        httpOnly: false,
        sameSite: 'None', // Use None for cross-origin
        secure: false, // Change to false for local testing
        path: '/'
    });
    next();
});

router.get('/get-cookie', (req, res) => {
    console.log(req.cookies);
    const cookieValue = req.cookies.myCookie;
    console.log('cookie read');
    res.send(`Cookie value: ${cookieValue}`);
});

module.exports = router;
