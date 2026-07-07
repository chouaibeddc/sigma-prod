"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require('crypto');
// Using require to match your exact architectural example for dbClient
const { dbClient } = require('../database/connection');
// =========================================
// PRIVATE HELPER FUNCTIONS
// =========================================
/**
 * Hashes a plain text refresh token using SHA-256.
 *
 * @param refreshToken - The plain text JWT refresh token.
 * @returns The hex-encoded SHA-256 hash of the token.
 */
function hashToken(refreshToken) {
    return crypto.createHash('sha256').update(refreshToken).digest('hex');
}
/**
 * Fetches a refresh token session row from the database by its hash.
 *
 * @param tokenHash - The SHA-256 hash of the refresh token.
 * @returns The refresh token row, or null if not found.
 */
async function fetchToken(tokenHash) {
    const query = `
        SELECT * 
        FROM refresh_tokens 
        WHERE token_hash = $1
    `;
    const result = await dbClient.query(query, [tokenHash]);
    return result.rows[0] || null;
}
/**
 * Inserts a new refresh token session into the database.
 *
 * @param userId - The ID of the user.
 * @param tokenHash - The SHA-256 hash of the refresh token.
 * @param expiresAt - The expiration timestamp of the token.
 * @param ipAddress - The IP address of the client.
 * @param userAgent - The User-Agent string of the client.
 * @returns The newly inserted refresh token row.
 */
async function insertToken(userId, tokenHash, expiresAt, ipAddress, userAgent) {
    const query = `
        INSERT INTO refresh_tokens (user_id, token_hash, expires_at, created_ip, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;
    const result = await dbClient.query(query, [
        userId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
    ]);
    return result.rows[0];
}
/**
 * Deletes a refresh token session from the database by its hash.
 *
 * @param tokenHash - The SHA-256 hash of the refresh token.
 * @returns The deleted refresh token row, or null if not found.
 */
async function deleteToken(tokenHash) {
    const query = `
        DELETE FROM refresh_tokens 
        WHERE token_hash = $1 
        RETURNING *
    `;
    const result = await dbClient.query(query, [tokenHash]);
    return result.rows[0] || null;
}
/**
 * Creates an authentication event log entry.
 *
 * @param userId - The ID of the user (can be null for unauthenticated events).
 * @param eventType - The type of event (e.g., LOGIN, LOGOUT, TOKEN_EXPIRED).
 * @param ipAddress - The IP address of the client.
 * @param userAgent - The User-Agent string of the client.
 * @param details - Optional JSON details about the event.
 * @returns The newly inserted auth event row.
 */
async function createAuthEvent(userId, eventType, ipAddress, userAgent, details) {
    const query = `
        INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, details)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
    `;
    const result = await dbClient.query(query, [
        userId,
        eventType,
        ipAddress,
        userAgent,
        details,
    ]);
    return result.rows[0];
}
// =========================================
// PUBLIC API CLASS
// =========================================
/**
 * RefreshTokenStorageAPI
 *
 * Handles the secure storage, validation, rotation, and revocation of JWT refresh tokens.
 * Access tokens are never stored. Only the SHA-256 hash of refresh tokens is persisted.
 */
class RefreshTokenStorageAPI {
    /**
     * Stores a new refresh token and logs a LOGIN event.
     *
     * @param userId - The ID of the user.
     * @param refreshToken - The plain text JWT refresh token.
     * @param expiresAt - The expiration date of the token.
     * @param ipAddress - The client's IP address.
     * @param userAgent - The client's User-Agent string.
     * @returns The inserted refresh token row.
     * @throws Error if the database operation fails.
     */
    static async create(userId, refreshToken, expiresAt, ipAddress, userAgent) {
        try {
            const tokenHash = hashToken(refreshToken);
            const row = await insertToken(userId, tokenHash, expiresAt, ipAddress, userAgent);
            await createAuthEvent(userId, 'LOGIN', ipAddress, userAgent, {
                token_hash: tokenHash,
            });
            return row;
        }
        catch (error) {
            throw new Error(`[RefreshTokenStorageAPI] Failed to create refresh token for user ${userId}: ${error.message}`);
        }
    }
    /**
     * Checks if a refresh token exists in the database.
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @returns True if the token exists, false otherwise.
     * @throws Error if the database operation fails.
     */
    static async exists(refreshToken) {
        try {
            const tokenHash = hashToken(refreshToken);
            const row = await fetchToken(tokenHash);
            return !!row;
        }
        catch (error) {
            throw new Error(`[RefreshTokenStorageAPI] Failed to check refresh token existence: ${error.message}`);
        }
    }
    /**
     * Validates a refresh token.
     * If expired, it automatically deletes the token and logs a TOKEN_EXPIRED event.
     * If valid, it updates the last_used_at timestamp and returns the row.
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @returns The refresh token row if valid, or null if invalid/expired.
     * @throws Error if the database operation fails.
     */
    static async validate(refreshToken) {
        try {
            const tokenHash = hashToken(refreshToken);
            const row = await fetchToken(tokenHash);
            if (!row) {
                const err = new Error('Refresh token not found or revoked.');
                err.code = 'REFRESH_TOKEN_REVOKED'; // <--- SPECIFIC CODE
                throw err;
            }
            // Check if token is expired
            if (new Date(row.expires_at) <= new Date()) {
                await deleteToken(tokenHash);
                await createAuthEvent(row.user_id, 'TOKEN_EXPIRED', null, null, { token_hash: tokenHash });
                const err = new Error('Refresh token expired.');
                err.code = 'REFRESH_TOKEN_EXPIRED'; // <--- SPECIFIC CODE
                throw err;
            }
            // Update last used timestamp
            const updateQuery = `
                UPDATE refresh_tokens 
                SET last_used_at = NOW() 
                WHERE token_hash = $1
            `;
            await dbClient.query(updateQuery, [tokenHash]);
            // Update in-memory object for return
            row.last_used_at = new Date();
            return row;
        }
        catch (error) {
            throw new Error(`[RefreshTokenStorageAPI] Failed to validate refresh token: ${error.message}`);
        }
    }
    /**
     * Updates the last used timestamp and IP address for a specific refresh token.
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @param ipAddress - The new IP address of the client.
     * @throws Error if the database operation fails.
     */
    static async updateLastUsed(refreshToken, ipAddress) {
        try {
            const tokenHash = hashToken(refreshToken);
            const query = `
                UPDATE refresh_tokens 
                SET last_used_at = NOW(), last_used_ip = $2 
                WHERE token_hash = $1
            `;
            await dbClient.query(query, [tokenHash, ipAddress]);
        }
        catch (error) {
            throw new Error(`[RefreshTokenStorageAPI] Failed to update last used info: ${error.message}`);
        }
    }
    /**
     * Revokes a specific refresh token and logs a LOGOUT event.
     * Uses a database transaction to ensure atomicity.
     *
     * @param refreshToken - The plain text JWT refresh token.
     * @param ipAddress - The client's IP address.
     * @param userAgent - The client's User-Agent string.
     * @throws Error if the token is not found or if the transaction fails.
     */
    static async revoke(refreshToken, ipAddress, userAgent) {
        await dbClient.query('BEGIN');
        try {
            const tokenHash = hashToken(refreshToken);
            const row = await fetchToken(tokenHash);
            if (!row) {
                throw new Error('Refresh token not found');
            }
            await createAuthEvent(row.user_id, 'LOGOUT', ipAddress || null, userAgent || null, { token_hash: tokenHash });
            await deleteToken(tokenHash);
            await dbClient.query('COMMIT');
        }
        catch (error) {
            await dbClient.query('ROLLBACK');
            throw new Error(`[RefreshTokenStorageAPI] Failed to revoke refresh token: ${error.message}`);
        }
    }
    /**
     * Revokes all refresh tokens for a specific user and logs an AUTH_LOGOUT_ALL event.
     * Uses a database transaction to ensure atomicity.
     *
     * @param userId - The ID of the user.
     * @throws Error if the transaction fails.
     */
    static async revokeAllForUser(userId) {
        await dbClient.query('BEGIN');
        try {
            const deleteQuery = `DELETE FROM refresh_tokens WHERE user_id = $1`;
            await dbClient.query(deleteQuery, [userId]);
            await createAuthEvent(userId, 'AUTH_LOGOUT_ALL', null, null, null);
            await dbClient.query('COMMIT');
        }
        catch (error) {
            await dbClient.query('ROLLBACK');
            throw new Error(`[RefreshTokenStorageAPI] Failed to revoke all refresh tokens for user ${userId}: ${error.message}`);
        }
    }
    /**
     * Rotates an old refresh token for a new one.
     * Validates the old token, deletes it, inserts the new one, and logs a TOKEN_ROTATED event.
     * Uses a database transaction to ensure atomicity.
     *
     * @param oldRefreshToken - The old plain text JWT refresh token.
     * @param newRefreshToken - The new plain text JWT refresh token.
     * @param newExpiresAt - The expiration date for the new token.
     * @param ipAddress - The client's IP address.
     * @param userAgent - The client's User-Agent string.
     * @returns The newly inserted refresh token row.
     * @throws Error if the old token is invalid/expired or if the transaction fails.
     */
    static async rotate(oldRefreshToken, newRefreshToken, newExpiresAt, ipAddress, userAgent) {
        await dbClient.query('BEGIN');
        try {
            const oldTokenHash = hashToken(oldRefreshToken);
            const oldRow = await fetchToken(oldTokenHash);
            if (!oldRow) {
                throw new Error('Old refresh token not found');
            }
            if (new Date(oldRow.expires_at) <= new Date()) {
                throw new Error('Old refresh token is expired');
            }
            // Delete old session
            await deleteToken(oldTokenHash);
            // Insert new session
            const newTokenHash = hashToken(newRefreshToken);
            const newRow = await insertToken(oldRow.user_id, newTokenHash, newExpiresAt, ipAddress, userAgent);
            // Log rotation event
            await createAuthEvent(oldRow.user_id, 'TOKEN_ROTATED', ipAddress, userAgent, {
                old_token_hash: oldTokenHash,
                new_token_hash: newTokenHash,
            });
            await dbClient.query('COMMIT');
            return newRow;
        }
        catch (error) {
            await dbClient.query('ROLLBACK');
            throw new Error(`[RefreshTokenStorageAPI] Failed to rotate refresh token: ${error.message}`);
        }
    }
    /**
     * Cleans up all expired refresh tokens from the database.
     * Typically called by a cron job or scheduled task.
     *
     * @returns The number of deleted rows.
     * @throws Error if the database operation fails.
     */
    static async cleanupExpired() {
        try {
            const query = `DELETE FROM refresh_tokens WHERE expires_at <= NOW()`;
            const result = await dbClient.query(query);
            return result.rowCount || 0;
        }
        catch (error) {
            throw new Error(`[RefreshTokenStorageAPI] Failed to cleanup expired refresh tokens: ${error.message}`);
        }
    }
}
module.exports = RefreshTokenStorageAPI;
//# sourceMappingURL=refreshtoken.storage.api.js.map