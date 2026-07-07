"use strict";
// db/BaseDAO.ts
Object.defineProperty(exports, "__esModule", { value: true });
const dbClient = require('../database/connection').dbClient;
class EntityAPI {
    constructor(table, idField) {
        this.table = table;
        this.idField = idField;
    }
    // =============================
    // CREATE
    // =============================
    async create(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        const columns = keys.map((k) => `"${k}"`).join(', ');
        const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
        const query = `
            INSERT INTO "${this.table}" (${columns})
            VALUES (${placeholders})
            RETURNING *;
        `;
        const result = await dbClient.query(query, values);
        return result.rows[0];
    }
    // =============================
    // GET BY ID
    // =============================
    async getById(id) {
        const query = `
            SELECT * FROM "${this.table}"
            WHERE "${String(this.idField)}" = $1
        `;
        const result = await dbClient.query(query, [id]);
        return result.rows[0] || null;
    }
    // =============================
    // GET ALL
    // =============================
    async getAll() {
        const result = await dbClient.query(`SELECT * FROM "${this.table}" ORDER BY ${this.table}CreatedAt DESC`);
        return result.rows;
    }
    // =============================
    // UPDATE
    // =============================
    async update(id, data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        if (keys.length === 0) {
            throw new Error('No fields to update');
        }
        const setClause = keys
            .map((key, i) => `"${key}" = $${i + 1}`)
            .join(', ');
        const query = `
            UPDATE "${this.table}"
            SET ${setClause}
            WHERE "${String(this.idField)}" = $${keys.length + 1}
            RETURNING *;
        `;
        const result = await dbClient.query(query, [...values, id]);
        return result.rows[0];
    }
    // =============================
    // DELETE
    // =============================
    async delete(id) {
        await dbClient.query(`DELETE FROM "${this.table}" WHERE "${String(this.idField)}" = $1`, [id]);
    }
    // =============================
    // FIND WITH FILTERS (VERY IMPORTANT)
    // =============================
    async getWhere(conditions) {
        const keys = Object.keys(conditions);
        if (keys.length === 0) {
            return this.getAll();
        }
        const values = Object.values(conditions);
        const whereClause = keys
            .map((key, i) => `"${key}" = $${i + 1}`)
            .join(' AND ');
        const query = `
            SELECT * FROM "${this.table}"
            WHERE ${whereClause}
            ORDER BY ${this.table}CreatedAt DESC
        `;
        const result = await dbClient.query(query, values);
        return result.rows;
    }
    // =============================
    // PAGINATION
    // =============================
    async getPaginated(limit, offset) {
        const query = `
            SELECT * FROM "${this.table}"
            LIMIT $1 OFFSET $2
        `;
        const result = await dbClient.query(query, [limit, offset]);
        return result.rows;
    }
    // =============================
    // COUNT (useful)
    // =============================
    async count() {
        const result = await dbClient.query(`SELECT COUNT(*) FROM "${this.table}"`);
        return parseInt(result.rows[0].count, 10);
    }
    // =============================
    // EXISTS
    // =============================
    async exists(id) {
        const result = await dbClient.query(`SELECT 1 FROM "${this.table}" WHERE "${String(this.idField)}" = $1 LIMIT 1`, [id]);
        return result.rowCount > 0;
    }
}
module.exports = EntityAPI;
//# sourceMappingURL=entity.api.js.map