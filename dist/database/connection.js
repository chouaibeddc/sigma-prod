"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Client } = require('pg');
const fs = require('fs');
/* Database configuration */
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = process.env.DB_PORT || 5432;
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'root';
const DB_NAME = process.env.DB_NAME || 'sigma_db';
const DB_SSLEnabled = process.env.DB_SSL === 'true';
const dbClient = new Client({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    ssl: DB_SSLEnabled
        ? {
            rejectUnauthorized: true,
            ca: fs.readFileSync(process.env.DB_SSL_CA).toString(),
        }
        : false,
});
async function connect() {
    try {
        await dbClient.connect();
        console.log('Connected to PostgreSQL database');
    }
    catch (err) {
        console.error('Database connection error', err);
        process.exit(1);
    }
}
module.exports = {
    dbClient,
    connect,
};
//# sourceMappingURL=connection.js.map