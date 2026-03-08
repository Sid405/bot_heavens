const express = require('express');

const app = express();

// Increase JSON and urlencoded body limits
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:true, limit:'10mb'}));

// Existing CORS, auth, and routes middleware would be here

// Rest of your code...

module.exports = app;