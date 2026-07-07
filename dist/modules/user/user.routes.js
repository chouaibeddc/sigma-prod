"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express = require('express');
const router = express.Router();
const access = require('../../middlware/access');
const userController = require('./user.controller');
// All routes require MANAGE_USERS privilege
router.use(access.accessControl('MANAGE_USERS'));
// List & detail
router.get('/get/all', userController.getAll);
router.get('/get/:id', userController.getById);
// Create
router.post('/create', userController.create);
// Update info (role, privileges, employeeId, isActive)
router.put('/update/:id', userController.update);
// Change password (admin resets any user's password)
router.put('/password/:id', userController.changePassword);
// Toggle block / unblock
router.put('/toggle/:id', userController.toggleActive);
// Set privileges directly
router.put('/privileges/:id', userController.setPrivileges);
// Delete
router.delete('/delete/:id', userController.remove);
module.exports = router;
//# sourceMappingURL=user.routes.js.map