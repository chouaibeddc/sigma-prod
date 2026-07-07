"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Using require as requested
const UserAPI = require('../../api/user.api');
const bcrypt = require('bcrypt');
// Import the enum as a VALUE so we can extract its values at runtime
const { Privilege_enum } = require('../../@types');
/**
 * Validate that all provided privileges exist in the Privilege_enum
 */
const validatePrivileges = (privs) => {
    if (!Array.isArray(privs))
        return false;
    const validValues = Object.values(Privilege_enum);
    return privs.every((p) => validValues.includes(p));
};
/**
 * Helper to safely remove password hash from user objects before sending to frontend.
 * Handles both camelCase (passwordHash) and snake_case (password_hash) just in case.
 */
const stripPassword = (user) => {
    if (!user)
        return user;
    const { passwordHash, password_hash, ...rest } = user;
    return rest;
};
// GET /api/admin/users/get/all
exports.getAll = (req, res, next) => {
    UserAPI.getAll()
        .then((users) => {
        const safeUsers = users.map(stripPassword);
        res.status(200).json(safeUsers);
    })
        .catch((err) => next(err));
};
// GET /api/admin/users/get/:id
exports.getById = (req, res, next) => {
    UserAPI.getById(req.params.id)
        .then((user) => {
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        res.status(200).json(stripPassword(user));
    })
        .catch((err) => next(err));
};
// POST /api/admin/users/create
exports.create = async (req, res, next) => {
    try {
        const { username, password, role, privileges, employeeId, isActive } = req.body;
        if (!username || !password || !role) {
            return res
                .status(400)
                .json({ error: 'Username, password, and role are required' });
        }
        // Validate Privileges against Enum
        if (privileges && !validatePrivileges(privileges)) {
            return res.status(400).json({
                error: 'Invalid privileges provided. Check the Privilege_enum.',
            });
        }
        const existing = await UserAPI.getByUsername(username);
        if (existing) {
            return res.status(409).json({ error: 'Username already taken' });
        }
        const passwordHash = await bcrypt.hash(password, Number(process.env.SALT_ROUNDS));
        // We use 'any' here to bypass TS interface mismatches between your DAO (camelCase)
        // and your Model (snake_case), while ensuring the DAO gets the exact keys it expects.
        const newUserForDao = {
            username,
            passwordHash,
            role,
            privileges: privileges || [],
            isActive: isActive !== undefined ? isActive : true,
            employeeId: employeeId || null,
            createdbyuserid: req.user?.userId, // Lowercase to match DB column exactly
        };
        const created = await UserAPI.create(newUserForDao);
        res.status(201).json(stripPassword(created));
    }
    catch (err) {
        next(err);
    }
};
// PUT /api/admin/users/update/:id
exports.update = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { role, privileges, employeeId, isActive } = req.body;
        // Validate Privileges if provided
        if (privileges !== undefined && !validatePrivileges(privileges)) {
            return res.status(400).json({
                error: 'Invalid privileges provided.',
            });
        }
        const updatesForDao = {};
        if (role !== undefined)
            updatesForDao.role = role;
        if (privileges !== undefined)
            updatesForDao.privileges = privileges;
        if (employeeId !== undefined)
            updatesForDao.employeeId = employeeId;
        if (isActive !== undefined)
            updatesForDao.isActive = isActive;
        // Lowercase to match DB column and avoid DAO regex mangling it to 'updated_by_u_i_d'
        updatesForDao.updatedbyuserid = req.user?.userId;
        const updated = await UserAPI.update(id, updatesForDao);
        if (!updated)
            return res.status(404).json({ error: 'User not found' });
        res.status(200).json(stripPassword(updated));
    }
    catch (err) {
        next(err);
    }
};
// PUT /api/admin/users/password/:id
exports.changePassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!newPassword || newPassword.length < 8) {
            return res
                .status(400)
                .json({ error: 'Password must be at least 8 characters' });
        }
        const passwordHash = await bcrypt.hash(newPassword, Number(process.env.SALT_ROUNDS));
        // Pass as any to satisfy DAO's expected camelCase key
        const updated = await UserAPI.update(id, { passwordHash });
        if (!updated)
            return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ message: 'Password updated successfully' });
    }
    catch (err) {
        next(err);
    }
};
// PUT /api/admin/users/toggle/:id   — block / unblock
exports.toggleActive = async (req, res, next) => {
    try {
        const { id } = req.params;
        const user = await UserAPI.getById(id);
        if (!user)
            return res.status(404).json({ error: 'User not found' });
        // Check both possible property names returned by DAO
        const currentStatus = user.isActive !== undefined
            ? user.isActive
            : user.is_active;
        const updated = await UserAPI.update(id, {
            isActive: !currentStatus,
        });
        res.status(200).json(stripPassword(updated));
    }
    catch (err) {
        next(err);
    }
};
// DELETE /api/admin/users/delete/:id
exports.remove = async (req, res, next) => {
    try {
        const { id } = req.params;
        // Prevent self-deletion
        if (req.user?.userId === id) {
            return res
                .status(403)
                .json({ error: 'Cannot delete your own account' });
        }
        const deleted = await UserAPI.delete(id);
        if (!deleted)
            return res.status(404).json({ error: 'User not found' });
        res.status(200).json({ message: 'User deleted' });
    }
    catch (err) {
        next(err);
    }
};
// PUT /api/admin/users/privileges/:id
exports.setPrivileges = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { privileges } = req.body;
        if (!Array.isArray(privileges)) {
            return res
                .status(400)
                .json({ error: 'Privileges must be an array' });
        }
        if (!validatePrivileges(privileges)) {
            return res.status(400).json({
                error: 'Invalid privileges provided.',
            });
        }
        const updated = await UserAPI.update(id, { privileges });
        if (!updated)
            return res.status(404).json({ error: 'User not found' });
        res.status(200).json(stripPassword(updated));
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=user.controller.js.map