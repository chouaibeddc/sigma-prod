"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const auth = require('../../middlware/auth');
const router = express.Router();
/* Controllers */
const fsProfileImagesController = require('./controllers/fs.profile.images');
/* Profile Images Routes */
router.get('/profile_images/load/:filename', fsProfileImagesController.load_profile_image);
module.exports = router;
//# sourceMappingURL=fs.routes.js.map