"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { dbClient } = require('../../database/connection');
const DatatypeMappingObjectAPI = require('../../api/datatype.mapping.object.api');
/* ── helper: extract a single string param safely ── */
function param(req, name) {
    const val = req.params?.[name];
    if (!val || Array.isArray(val))
        return null;
    return val.toUpperCase();
}
// GET /config/settings
exports.getAll = async (req, res, next) => {
    try {
        const { rows } = await dbClient.query('SELECT key_, val_, type_ FROM settings ORDER BY key_');
        res.json({ success: true, data: rows });
    }
    catch (err) {
        next(err);
    }
};
// PUT /config/settings/:key
exports.updateOne = async (req, res, next) => {
    try {
        const key = param(req, 'key');
        if (!key) {
            res.status(400).json({
                success: false,
                message: 'Invalid key param',
            });
            return;
        }
        const { value } = req.body;
        const { rows } = await dbClient.query('UPDATE settings SET val_ = $1 WHERE key_ = $2 RETURNING *', [value ?? null, key]);
        if (!rows.length) {
            res.status(404).json({ success: false, message: 'Key not found' });
            return;
        }
        res.json({ success: true, data: rows[0] });
    }
    catch (err) {
        next(err);
    }
};
// PATCH /config/settings/bulk  — body: { settings: [{key, value}] }
exports.bulkUpdate = async (req, res, next) => {
    const { settings } = req.body;
    if (!Array.isArray(settings) || !settings.length) {
        res.status(400).json({
            success: false,
            message: 'settings[] required',
        });
        return;
    }
    try {
        await dbClient.query('BEGIN');
        const updated = [];
        for (const { key, value } of settings) {
            if (typeof key !== 'string' || !key.trim())
                continue;
            const { rows } = await dbClient.query('UPDATE settings SET val_ = $1 WHERE key_ = $2 RETURNING *', [value ?? null, key.toUpperCase()]);
            if (rows.length)
                updated.push(rows[0]);
        }
        await dbClient.query('COMMIT');
        res.json({ success: true, updated });
    }
    catch (err) {
        await dbClient.query('ROLLBACK');
        next(err);
    }
};
// POST /config/settings  — add a new dynamic key
exports.createOne = async (req, res, next) => {
    try {
        const { key, value, type = 'text' } = req.body;
        if (typeof key !== 'string' || !key.trim()) {
            res.status(400).json({
                success: false,
                message: 'key is required',
            });
            return;
        }
        const { rows } = await dbClient.query(`INSERT INTO settings (key_, val_, type_)
             VALUES ($1, $2, $3)
             ON CONFLICT (key_) DO NOTHING
             RETURNING *`, [key.toUpperCase(), value ?? null, type]);
        if (!rows.length) {
            res.status(409).json({
                success: false,
                message: 'Key already exists',
            });
            return;
        }
        res.status(201).json({ success: true, data: rows[0] });
    }
    catch (err) {
        next(err);
    }
};
// DELETE /config/settings/:key
exports.deleteOne = async (req, res, next) => {
    try {
        const key = param(req, 'key');
        if (!key) {
            res.status(400).json({
                success: false,
                message: 'Invalid key param',
            });
            return;
        }
        const { rows } = await dbClient.query('DELETE FROM settings WHERE key_ = $1 RETURNING key_', [key]);
        if (!rows.length) {
            res.status(404).json({ success: false, message: 'Key not found' });
            return;
        }
        res.json({ success: true, deleted: key });
    }
    catch (err) {
        next(err);
    }
};
exports.getDatatypeMappingObject = async (req, res, next) => {
    try {
        const key = param(req, 'key');
        if (!key) {
            res.status(400).json({
                success: false,
                message: 'Invalid or missing key parameter.',
            });
            return;
        }
        const mapping = await DatatypeMappingObjectAPI.getSettingJson(key);
        if (mapping === null) {
            res.status(404).json({
                success: false,
                message: `Setting "${key}" was not found.`,
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: mapping,
        });
    }
    catch (error) {
        console.error(`[DatatypeMappingController] Failed to load "${req.params.key}"`, error);
        next(error);
    }
};
//# sourceMappingURL=config.controller.js.map