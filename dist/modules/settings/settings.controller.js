"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//  Destructuring pour récupérer directement l'instance dbClient
// au lieu de l'objet module entier { dbClient, connect }
const { dbClient } = require('../../database/connection');
const DatatypeMappingObjectAPI = require('../../api/datatype.mapping.object.api');
// const getSettingsByKeysArray = async (
//     keys: string[],
// ): Promise<Record<string, string>> => {
//     if (!keys || keys.length === 0) return {};
//     try {
//         const result = await dbClient.query(
//             'SELECT key_, val_ FROM settings WHERE key_ = ANY($1)',
//             [keys],
//         );
//         const config: Record<string, string> = {};
//         result.rows.forEach((row: any) => {
//             config[row.key_] = row.val_;
//         });
//         console.log(config);
//         return config;
//     } catch (error) {
//         console.error('Error fetching internal settings array:', error);
//         throw error;
//     }
// };
const getSettingsByKeysArray = async (keys) => {
    if (!keys || keys.length === 0)
        return {};
    try {
        // Add ::text[] cast right here
        const result = await dbClient.query('SELECT key_, val_ FROM settings WHERE key_ = ANY($1::text[])', [keys]);
        const config = {};
        result.rows.forEach((row) => {
            config[row.key_] = row.val_;
        });
        return config;
    }
    catch (error) {
        // This will print the actual underlying driver error to your terminal console
        throw error;
    }
};
exports.getSettings = async (req, res, next) => {
    try {
        const result = await dbClient.query('SELECT key_, val_ FROM settings');
        const settings = {};
        // Transformation en objet { KEY: "value" }
        result.rows.forEach((row) => {
            settings[row.key_] = row.val_;
        });
        res.json(settings);
    }
    catch (error) {
        next(error);
    }
};
exports.getSettingsByKey = async (req, res, next) => {
    try {
        const result = await dbClient.query('SELECT key_, val_ FROM settings WHERE key_ = $1', [req.params.key]);
        const settings = {};
        // Transformation en objet { KEY: "value" }
        result.rows.forEach((row) => {
            settings[row.key_] = row.val_;
        });
        res.json(settings);
    }
    catch (error) {
        next(error);
    }
};
exports.getBulkSettings = async (req, res, next) => {
    try {
        const { keys } = req.body;
        if (!keys || !Array.isArray(keys)) {
            return res
                .status(400)
                .json({ error: 'Missing parameter "keys" as an array' });
        }
        const settingsData = await getSettingsByKeysArray(keys);
        res.json(settingsData);
    }
    catch (error) {
        next(error);
    }
};
exports.updateSettings = async (req, res, next) => {
    try {
        const settings = req.body; // Reçoit l'objet complet { KEY: "value", ... }
        // Utilisation d'une transaction pour la sécurité
        await dbClient.query('BEGIN');
        for (const key of Object.keys(settings)) {
            const value = settings[key];
            // INSERT ... ON CONFLICT DO UPDATE (Upsert)
            await dbClient.query(`INSERT INTO settings (key_, val_) VALUES ($1, $2) 
                 ON CONFLICT (key_) DO UPDATE SET val_ = EXCLUDED.val_`, [key, value]);
        }
        await dbClient.query('COMMIT');
        res.json({ success: true, message: 'Settings updated successfully' });
    }
    catch (error) {
        await dbClient.query('ROLLBACK');
        next(error);
    }
};
exports.getDatatypeMappingObject = async (req, res, next) => {
    try {
        const key = req.params.key;
        if (!key || typeof key !== 'string' || !key.trim()) {
            return res.status(400).json({
                error: 'Missing or invalid parameter "key".',
            });
        }
        const mapping = await DatatypeMappingObjectAPI.getSettingJson(key.toUpperCase());
        if (mapping === null) {
            return res.status(404).json({
                error: `Setting "${key}" not found.`,
            });
        }
        res.status(200).json(mapping);
    }
    catch (error) {
        next(error);
    }
};
//# sourceMappingURL=settings.controller.js.map