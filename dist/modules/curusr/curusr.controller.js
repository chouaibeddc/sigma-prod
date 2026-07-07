"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const UserAPI = require('../../api/user.api'); // Adjust path to your user.api.ts
const bcrypt = require('bcrypt');
/**
 * Helper to safely remove password hash from user objects before sending to frontend.
 */
const stripPassword = (user) => {
    if (!user)
        return user;
    const { passwordHash, password_hash, ...rest } = user;
    return rest;
};
/**
 * GET /api/curusr
 * Fetches all information about the currently logged-in user.
 */
exports.getProfile = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const user = await UserAPI.getById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Strip sensitive data before sending to client
        res.status(200).json(stripPassword(user));
    }
    catch (err) {
        next(err);
    }
};
/**
 * PUT /api/curusr/chpwd
 * Changes the password for the currently logged-in user.
 * Expects: { oldPassword, newPassword, confirmPassword }
 */
exports.changePassword = async (req, res, next) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { oldPassword, newPassword, confirmPassword } = req.body;
        // 1. Validate input presence
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                error: 'Old password, new password, and confirmation are required',
            });
        }
        // 2. Validate passwords match
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                error: 'New password and confirmation do not match',
            });
        }
        // 3. Validate password strength
        if (newPassword.length < 8) {
            return res.status(400).json({
                error: 'New password must be at least 8 characters',
            });
        }
        // 4. Fetch user to check old password
        const user = await UserAPI.getById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // 5. Verify the old password
        const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect old password' });
        }
        // 6. Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, Number(process.env.SALT_ROUNDS));
        // 7. Update the user's password in the database
        const updated = await UserAPI.update(userId, { passwordHash });
        if (!updated) {
            return res.status(500).json({ error: 'Failed to update password' });
        }
        res.status(200).json({ message: 'Password updated successfully' });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=curusr.controller.js.map