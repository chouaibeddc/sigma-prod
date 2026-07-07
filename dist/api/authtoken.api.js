"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jwt = require('jsonwebtoken');
const ms = require('ms');
const { isHumanReadableTime } = require('../util/helpers');
const RefreshTokenStorageAPI = require('./refreshtoken.storage.api'); // Adjust path if needed
class AuthTokenAPI {
    /**
     * Validates the refresh token against the DB, rotates it, and generates a new access token.
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @param ipAddress - The client's IP address.
     * @param userAgent - The client's User-Agent string.
     * @returns An object containing the new accessToken, new refreshToken, and user payload.
     */
    /**
     * Validates the refresh token against the DB and generates a new access token.
     * (Refresh token rotation is DISABLED to ensure system stability).
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @param ipAddress - The client's IP address.
     * @param userAgent - The client's User-Agent string.
     * @returns An object containing the new accessToken, the same refreshToken, and user payload.
     */
    static async refreshAccessToken(refreshToken, ipAddress, userAgent) {
        if (!refreshToken) {
            const err = new Error('Refresh token not found.');
            err.code = 'NO_REFRESH_TOKEN'; // <--- SPECIFIC CODE
            throw err;
        }
        let payload;
        // 1. Verify JWT signature
        try {
            payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || '123');
        }
        catch (err) {
            const error = new Error('Invalid refresh token signature.');
            error.code = 'REFRESH_TOKEN_INVALID'; // <--- SPECIFIC CODE
            throw error;
        }
        // 2. Validate against database (checks existence/expiration and updates last_used_at)
        await RefreshTokenStorageAPI.validate(refreshToken);
        // 3. Generate new access token ONLY
        const JWT_EXPIRES = isHumanReadableTime(process.env.JWT_EXPIRES) || '15m';
        const newAccessToken = jwt.sign({
            userId: payload.userId,
            privileges: payload.privileges,
            role: payload.role,
        }, process.env.JWT_SECRET || '123', { expiresIn: JWT_EXPIRES });
        // 4. Return the new access token and the SAME refresh token (No rotation)
        return {
            accessToken: newAccessToken,
            refreshToken: refreshToken, // Reusing the existing refresh token
            userId: payload.userId,
            privileges: payload.privileges,
            role: payload.role,
        };
    }
    // static async refreshAccessToken(
    //     refreshToken: string,
    //     ipAddress: string,
    //     userAgent: string,
    // ): Promise<any> {
    //     if (!refreshToken) {
    //         throw new Error('Refresh token not found.');
    //     }
    //     let payload: any;
    //     // 1. Verify JWT signature
    //     try {
    //         payload = jwt.verify(
    //             refreshToken,
    //             process.env.JWT_REFRESH_SECRET || '123',
    //         );
    //     } catch (err) {
    //         throw new Error('Invalid or expired refresh token signature.');
    //     }
    //     // 2. Validate against database (checks existence and expiration, logs TOKEN_EXPIRED if needed)
    //     const validTokenRow =
    //         await RefreshTokenStorageAPI.validate(refreshToken);
    //     if (!validTokenRow) {
    //         throw new Error('Refresh token is invalid, expired, or revoked.');
    //     }
    //     // 3. Generate new tokens
    //     const JWT_EXPIRES =
    //         isHumanReadableTime(process.env.JWT_EXPIRES) || '15m';
    //     const JWT_REFRESH_EXPIRES =
    //         isHumanReadableTime(process.env.JWT_REFRESH_EXPIRES) || '7d';
    //     const newAccessToken = jwt.sign(
    //         {
    //             userId: payload.userId,
    //             privileges: payload.privileges,
    //             role: payload.role,
    //         },
    //         process.env.JWT_SECRET || '123',
    //         { expiresIn: JWT_EXPIRES },
    //     );
    //     const newRefreshToken = jwt.sign(
    //         {
    //             userId: payload.userId,
    //             privileges: payload.privileges,
    //             role: payload.role,
    //         },
    //         process.env.JWT_REFRESH_SECRET || '123',
    //         { expiresIn: JWT_REFRESH_EXPIRES },
    //     );
    //     // Calculate new expiration date for the database
    //     const newExpiresAt = new Date(Date.now() + ms(JWT_REFRESH_EXPIRES));
    //     // 4. Rotate the token in the database (deletes old, inserts new, logs TOKEN_ROTATED)
    //     await RefreshTokenStorageAPI.rotate(
    //         refreshToken,
    //         newRefreshToken,
    //         newExpiresAt,
    //         ipAddress,
    //         userAgent,
    //     );
    //     return {
    //         accessToken: newAccessToken,
    //         refreshToken: newRefreshToken,
    //         userId: payload.userId,
    //         privileges: payload.privileges,
    //         role: payload.role,
    //     };
    // }
    /**
     * Extracts the refresh token from the request cookie and processes it.
     */
    static async refreshAccessTokenFromCookie(req) {
        const refreshToken = req.cookies?.refreshToken;
        const ipAddress = req.ip ||
            req.socket?.remoteAddress ||
            req.connection?.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';
        return this.refreshAccessToken(refreshToken, ipAddress, userAgent);
    }
}
module.exports = AuthTokenAPI;
//# sourceMappingURL=authtoken.api.js.map