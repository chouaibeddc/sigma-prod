"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jwt = require('jsonwebtoken');
const ms = require('ms');
const bcrypt = require('bcrypt');
const UserAPI = require('../../api/user.api');
const AuthTokenAPI = require('../../api/authtoken.api');
const RefreshTokenStorageAPI = require('../../api/refreshtoken.storage.api'); // Import new API
const { isHumanReadableTime } = require('../../util/helpers');
/**
 * Handles user login, generates tokens, and stores the refresh token hash in the DB.
 */
exports.login = async (req, res, next) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res
            .status(400)
            .json({ error: 'Username & Password are required' });
    }
    try {
        const user = await UserAPI.getByUsername(username);
        if (!user) {
            return res.status(404).json({ error: 'User not found!' });
        }
        if (!user.isActive) {
            return res.status(403).json({ error: 'User account is disabled!' });
        }
        if (!bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ error: 'Invalid password!' });
        }
        const payload = {
            userId: user.id,
            privileges: user.privileges,
            role: user.role,
        };
        const JWT_EXPIRES = isHumanReadableTime(process.env.JWT_EXPIRES) || '15m';
        const JWT_REFRESH_EXPIRES = isHumanReadableTime(process.env.JWT_REFRESH_EXPIRES) || '7d';
        const accessToken = jwt.sign(payload, process.env.JWT_SECRET || '123', {
            expiresIn: JWT_EXPIRES,
        });
        const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET || '123', { expiresIn: JWT_REFRESH_EXPIRES });
        // --- NEW: Store Refresh Token in Database ---
        const ipAddress = req.ip ||
            req.socket?.remoteAddress ||
            req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        const expiresAt = new Date(Date.now() + ms(JWT_REFRESH_EXPIRES));
        await RefreshTokenStorageAPI.create(user.id, refreshToken, expiresAt, ipAddress, userAgent);
        // --------------------------------------------
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: process.env.SAME_SITE || 'strict',
            maxAge: ms(JWT_REFRESH_EXPIRES),
        });
        return res.status(200).json({
            username: user.username,
            role: user.role,
            privileges: user.privileges,
            profileImage: user.profileImage,
            accessToken: accessToken,
        });
    }
    catch (err) {
        next(err);
    }
};
/**
 * Handles token refresh. Validates the old token, rotates it, and issues a new access token.
 */
exports.refresh = async (req, res, next) => {
    try {
        const login = req.query.login || false;
        // This now returns the new access token AND the new rotated refresh token
        const data = await AuthTokenAPI.refreshAccessTokenFromCookie(req);
        // const JWT_REFRESH_EXPIRES =
        //     isHumanReadableTime(process.env.JWT_REFRESH_EXPIRES) || '7d';
        // // --- NEW: Update the cookie with the newly rotated refresh token ---
        // res.cookie('refreshToken', data.refreshToken, {
        //     httpOnly: true,
        //     secure: true,
        //     sameSite: (process.env.SAME_SITE as any) || 'strict',
        //     maxAge: ms(JWT_REFRESH_EXPIRES),
        // });
        // -----------------------------------------------------------------
        if (login) {
            const username = await UserAPI.getUsernameById(data.userId);
            return res.status(200).json({
                username: username,
                role: data.role,
                privileges: data.privileges,
                profileImage: '',
                accessToken: data.accessToken,
            });
        }
        return res.status(200).json({
            accessToken: data.accessToken,
        });
    }
    catch (err) {
        // --- NEW: Send the specific error code to the frontend ---
        if (err.code) {
            res.clearCookie('refreshToken');
            return res.status(401).json({ error: err.message, code: err.code });
        }
        // ----------------------------------------------------------
        next(err);
    }
};
/**
 * NEW: Handles user logout. Revokes the refresh token in the DB and clears the cookie.
 */
exports.logout = async (req, res, next) => {
    try {
        const refreshToken = req.cookies?.refreshToken;
        if (refreshToken) {
            const ipAddress = req.ip ||
                req.socket?.remoteAddress ||
                req.connection?.remoteAddress;
            const userAgent = req.headers['user-agent'] || '';
            // --- NEW: Revoke the token in the database (logs LOGOUT event) ---
            await RefreshTokenStorageAPI.revoke(refreshToken, ipAddress, userAgent);
        }
        // Clear the cookie on the client
        res.clearCookie('refreshToken', {
            httpOnly: true,
            secure: true,
            sameSite: process.env.SAME_SITE || 'strict',
        });
        return res.status(200).json({
            message: 'Logged out successfully',
        });
    }
    catch (err) {
        // Even if the DB fails, ensure the cookie is cleared on the client
        res.clearCookie('refreshToken');
        next(err);
    }
};
//# sourceMappingURL=auth.controller.js.map