"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require('fs/promises');
const path = require('path');
// ANSI color codes for beautiful console output
const COLORS = {
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    GREEN: '\x1b[32m',
    CYAN: '\x1b[36m',
    MAGENTA: '\x1b[35m',
    BLUE: '\x1b[34m',
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
};
/**
 * Recursively sanitizes sensitive fields from an object.
 */
function sanitizeData(data) {
    if (!data || typeof data !== 'object')
        return data;
    const sanitized = Array.isArray(data) ? [] : {};
    const sensitiveRegex = /password|token|secret|auth|creditcard|ssn|apiKey|authorization|cookie|privilege/i;
    for (const [key, value] of Object.entries(data)) {
        if (sensitiveRegex.test(key)) {
            sanitized[key] = '***REDACTED***';
        }
        else if (typeof value === 'object' && value !== null) {
            sanitized[key] = sanitizeData(value);
        }
        else {
            sanitized[key] = value;
        }
    }
    return sanitized;
}
class Logger {
    /**
     * Formats and prints the log to the console with beautiful alignment and colors.
     */
    static formatConsole(level, color, message, details) {
        const timestamp = new Date()
            .toISOString()
            .replace('T', ' ')
            .substring(0, 19);
        const requestId = details?.requestId;
        const userId = details?.userId;
        const fields = {};
        if (requestId)
            fields['RequestId'] = requestId;
        if (userId)
            fields['User'] = userId;
        if (details) {
            for (const [key, value] of Object.entries(details)) {
                if (key !== 'requestId' &&
                    key !== 'userId' &&
                    value !== undefined) {
                    const formattedKey = key.charAt(0).toUpperCase() + key.slice(1);
                    fields[formattedKey] = value;
                }
            }
        }
        let output = `\n${color}${COLORS.BOLD}[${timestamp}] ${level}${COLORS.RESET}\n\n${message}`;
        if (Object.keys(fields).length > 0) {
            const maxKeyLength = Math.max(...Object.keys(fields).map((k) => k.length));
            output += '\n';
            for (const [key, value] of Object.entries(fields)) {
                const paddedKey = key.padEnd(maxKeyLength, ' ');
                output += `\n${paddedKey} : ${value}`;
            }
        }
        console.log(output + '\n');
    }
    /**
     * Asynchronously writes the log entry to the appropriate daily file.
     */
    static async writeToFile(folder, logEntry) {
        const dateStr = new Date().toISOString().substring(0, 10);
        const dir = path.join(process.cwd(), 'logs', folder);
        const filePath = path.join(dir, `${dateStr}.log`);
        try {
            await fs.mkdir(dir, { recursive: true });
            await fs.appendFile(filePath, JSON.stringify(logEntry) + '\n', 'utf8');
        }
        catch (err) {
            console.error('Failed to write log to file:', err);
        }
    }
    /**
     * Core logging method that handles both console and file output.
     */
    static log(level, color, folder, message, details) {
        const timestamp = new Date().toISOString();
        const safeDetails = sanitizeData(details);
        // Extract requestId and userId, and keep the rest in cleanDetails
        const { requestId, userId, ...cleanDetails } = safeDetails || {};
        const logEntry = {
            timestamp,
            level,
            requestId: requestId || undefined,
            message,
            details: cleanDetails || {},
        };
        this.formatConsole(level, color, message, safeDetails);
        this.writeToFile(folder, logEntry);
    }
    static info(message, details) {
        this.log('INFO', COLORS.GREEN, 'application', message, details);
    }
    static warn(message, details) {
        this.log('WARN', COLORS.YELLOW, 'application', message, details);
    }
    static error(message, details) {
        this.log('ERROR', COLORS.RED, 'errors', message, details);
    }
    static debug(message, details) {
        this.log('DEBUG', COLORS.CYAN, 'application', message, details);
    }
    static access(message, details) {
        this.log('ACCESS', COLORS.MAGENTA, 'access', message, details);
    }
    static application(message, details) {
        this.log('APPLICATION', COLORS.BLUE, 'application', message, details);
    }
}
module.exports = { Logger };
//# sourceMappingURL=logger.js.map