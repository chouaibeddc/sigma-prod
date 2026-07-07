"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = require('crypto');
/**
 * Middleware to attach a unique requestId to every request.
 */
const requestContext = (req, res, next) => {
    const headerId = req.headers['x-request-id'];
    // Handle cases where headers might be arrays
    const existingId = Array.isArray(headerId) ? headerId[0] : headerId;
    req.requestId = existingId || crypto.randomUUID();
    next();
};
module.exports = { requestContext };
//# sourceMappingURL=request.context.js.map