"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const console = require("node:console");
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const fsBasic = require('./fs.basic');
/* This controller is created to handle Profile images routes */
exports.upload_profile_image = (req, res, next) => { };
// To access to default images, you should use "default%5C"
exports.load_profile_image = (req, res, next) => {
    fsBasic.load(req, res, next, 'profile_images/');
};
//# sourceMappingURL=fs.profile.images.js.map