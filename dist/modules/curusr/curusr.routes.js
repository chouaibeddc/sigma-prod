"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
// Import your auth middleware (Adjust the path to where your auth.ts file is located)
// Note: Keeping the 'middlware' typo to match your existing user.routes.ts structure
const curusrController = require('./curusr.controller');
// GET /api/curusr
router.get('/', curusrController.getProfile);
// PUT /api/curusr/chpwd
router.put('/chpwd', curusrController.changePassword);
module.exports = router;
//# sourceMappingURL=curusr.routes.js.map