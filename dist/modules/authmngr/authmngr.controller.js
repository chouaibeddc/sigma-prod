"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { dbClient } = require('../../database/connection');
const RefreshTokenStorageAPI = require('../../api/refreshtoken.storage.api');
// =====================================================
// GET AUTH EVENTS (History)
// =====================================================
exports.getAuthEvents = async (req, res, next) => {
    try {
        const result = await dbClient.query(`
            SELECT 
                ae.id,
                ae.event_type,
                ae.created_at,
                ae.ip_address,
                ae.user_agent,
                ae.details,
                u.username
            FROM auth_events ae
            LEFT JOIN users u ON u.id = ae.user_id
            ORDER BY ae.created_at DESC
            LIMIT 500
        `);
        res.status(200).json({ total: result.rowCount, events: result.rows });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// GET ACTIVE SESSIONS
// =====================================================
exports.getActiveSessions = async (req, res, next) => {
    try {
        // We select rt.id (the session UUID) so the frontend can revoke specific sessions,
        // but we DO NOT select token_hash to keep it secure.
        const result = await dbClient.query(`
            SELECT 
                rt.id,
                rt.user_id,
                rt.created_at,
                rt.expires_at,
                rt.last_used_at,
                rt.created_ip,
                rt.last_used_ip,
                rt.user_agent,
                u.username
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            ORDER BY rt.last_used_at DESC NULLS LAST, rt.created_at DESC
        `);
        res.status(200).json({ total: result.rowCount, sessions: result.rows });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// REVOKE ALL SESSIONS FOR A USER
// =====================================================
exports.revokeUserSessions = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const userCheck = await dbClient.query('SELECT username FROM users WHERE id = $1', [userId]);
        if (userCheck.rowCount === 0) {
            res.status(404).json({ error: 'User not found.' });
            return;
        }
        // Uses your existing API which handles the DB transaction and logs AUTH_LOGOUT_ALL
        await RefreshTokenStorageAPI.revokeAllForUser(userId);
        res.status(200).json({
            message: `All sessions revoked for user ${userCheck.rows[0].username}.`,
        });
    }
    catch (err) {
        next(err);
    }
};
// =====================================================
// REVOKE SPECIFIC SESSION
// =====================================================
exports.revokeSpecificSession = async (req, res, next) => {
    try {
        const { sessionId } = req.params;
        // Delete session and get user_id to log the event manually
        const result = await dbClient.query('DELETE FROM refresh_tokens WHERE id = $1 RETURNING user_id', [sessionId]);
        if (result.rowCount === 0) {
            res.status(404).json({ error: 'Session not found.' });
            return;
        }
        const userId = result.rows[0].user_id;
        const ipAddress = req.ip || req.socket?.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;
        // Log the manual revocation in auth_events to maintain audit trail
        await dbClient.query(`INSERT INTO auth_events (user_id, event_type, ip_address, user_agent, details) 
             VALUES ($1, 'LOGOUT', $2, $3, $4)`, [
            userId,
            ipAddress,
            userAgent,
            { reason: 'Admin manually revoked session' },
        ]);
        res.status(200).json({ message: 'Session revoked successfully.' });
    }
    catch (err) {
        next(err);
    }
};
//# sourceMappingURL=authmngr.controller.js.map