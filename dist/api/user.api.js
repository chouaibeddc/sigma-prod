"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/* Database client */
const dbClient = require('../database/connection').dbClient;
/**
 * Author  : EL KHYATI Bouchaib
 * version : 1.0.0
 * User API
 * Provides all database operations related to the User entity
 */
class UserAPI {
    /**
     * Get all users
     * @returns Array of User objects
     */
    static async getAll() {
        try {
            const query = `SELECT * FROM users ORDER BY created_at DESC`;
            const result = await dbClient.query(query);
            // Map every row to the User interface structure
            return result.rows.map((row) => ({
                id: row.id,
                employeeId: row.employee_id, // Modifiy later
                username: row.username,
                role: row.role,
                privileges: row.privileges,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastLogin: row.last_login,
                profileImage: row.profile_image,
            }));
        }
        catch (err) {
            console.error('Error in getAll users:', err);
            throw err;
        }
    }
    /**
     * Get a user by username
     * @param username - username of the user
     * @returns User object or null if not found
     */
    static async getByUsername(username) {
        try {
            const query = `SELECT * FROM users WHERE username = $1 LIMIT 1`;
            const result = await dbClient.query(query, [username]);
            if (result.rows.length === 0)
                return null;
            const row = result.rows[0];
            return {
                id: row.id,
                employeeId: row.employee_id,
                username: row.username,
                passwordHash: row.password_hash,
                role: row.role,
                privileges: row.privileges,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastLogin: row.last_login,
                profileImage: row.profile_image,
            };
        }
        catch (err) {
            console.error('Error in getByUsername:', err);
            throw err;
        }
    }
    /**
     * Get a user by ID
     * @param id - user id
     * @returns User object or null if not found
     */
    static async getById(id) {
        try {
            const query = `SELECT * FROM users WHERE id = $1 LIMIT 1`;
            const result = await dbClient.query(query, [id]);
            if (result.rows.length === 0)
                return null;
            const row = result.rows[0];
            return {
                id: row.id,
                employeeId: row.employee_id,
                username: row.username,
                passwordHash: row.password_hash,
                role: row.role,
                privileges: row.privileges,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastLogin: row.last_login,
                profileImage: row.profile_image,
            };
        }
        catch (err) {
            console.error('Error in getById:', err);
            throw err;
        }
    }
    /**
     * Create a new user
     * @param user - User object to insert
     * @returns inserted User
     */
    // static async create(user: User): Promise<User> {
    //     try {
    //         const query = `
    //     INSERT INTO users
    //     ( employee_id, username, password_hash, role, privileges, is_active , last_login)
    //     VALUES ($1,$2,$3,$4,$5,$6)
    //     RETURNING *`;
    //         const values = [
    //             user.employeeId ?? null,
    //             user.username,
    //             user.passwordHash,
    //             user.role,
    //             user.privileges,
    //             user.isActive,
    //             user.lastLogin ?? null,
    //         ];
    //         const result = await dbClient.query(query, values);
    //         return result.rows[0];
    //     } catch (err) {
    //         console.error('Error in addUser:', err);
    //         throw err;
    //     }
    // }
    static async create(user) {
        try {
            const query = `
            INSERT INTO users 
            (employee_id, username, password_hash, role, privileges, is_active, last_login)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`;
            const values = [
                user.employeeId ?? null,
                user.username,
                user.passwordHash,
                user.role,
                user.privileges || [],
                user.isActive !== undefined ? user.isActive : true,
                user.lastLogin ?? null,
            ];
            const result = await dbClient.query(query, values);
            const row = result.rows[0];
            // Map back to your User interface
            return {
                id: row.id,
                employeeId: row.employee_id,
                username: row.username,
                passwordHash: row.password_hash,
                role: row.role,
                privileges: row.privileges,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastLogin: row.last_login,
                profileImage: row.profile_image,
            };
        }
        catch (err) {
            console.error('Error in addUser:', err);
            throw err;
        }
    }
    /**
     * Update a user by ID
     * @param id - ID of the user to update
     * @param user - Partial User object containing fields to update
     * @returns updated User or null if not found
     */
    static async update(id, user) {
        try {
            // Dynamically build set clause
            const setClauses = [];
            const values = [];
            let i = 1;
            for (const [key, value] of Object.entries(user)) {
                let column = key.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase()); // camelCase to snake_case
                setClauses.push(`${column} = $${i}`);
                values.push(value);
                i++;
            }
            if (setClauses.length === 0)
                return null;
            values.push(id);
            const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${i} RETURNING *`;
            const result = await dbClient.query(query, values);
            if (result.rows.length === 0)
                return null;
            const row = result.rows[0];
            return {
                id: row.id,
                employeeId: row.employee_id,
                username: row.username,
                passwordHash: row.password_hash,
                role: row.role,
                privileges: row.privileges,
                isActive: row.is_active,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                lastLogin: row.last_login,
                profileImage: row.profile_image,
            };
        }
        catch (err) {
            console.error('Error in updateUser:', err);
            throw err;
        }
    }
    /**
     * Delete a user by ID
     * @param id - ID of the user
     * @returns true if deleted, false if not found
     */
    static async delete(id) {
        try {
            const query = `DELETE FROM users WHERE id = $1`;
            const result = await dbClient.query(query, [id]);
            return result.rowCount > 0;
        }
        catch (err) {
            console.error('Error in deleteUser:', err);
            throw err;
        }
    }
    /**
     * Get username by user ID
     * @param id - User ID
     * @returns Username or null if the user is not found
     */
    static async getUsernameById(id) {
        try {
            const query = `
            SELECT username
            FROM users
            WHERE id = $1
            LIMIT 1
        `;
            const result = await dbClient.query(query, [id]);
            if (result.rows.length === 0) {
                return null;
            }
            return result.rows[0].username;
        }
        catch (err) {
            console.error('Error in getUsernameById:', err);
            throw err;
        }
    }
}
module.exports = UserAPI;
//# sourceMappingURL=user.api.js.map