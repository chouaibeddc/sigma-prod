"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Logger } = require('./Logger');
/**
 * Middleware to log incoming requests and their responses.
 */
const requestLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        // Sanitize URL to prevent logging tokens/passwords in query params
        const sanitizedUrl = req.originalUrl.replace(/(password|token|secret|auth|key)=([^&]+)/gi, '$1=***');
        Logger.access(`${req.method} ${sanitizedUrl}`, {
            requestId: req.requestId,
            userId: req.user?.userId,
            Method: req.method,
            Url: sanitizedUrl,
            StatusCode: res.statusCode,
            ResponseTime: `${duration}ms`,
            IP: req.ip,
            UserAgent: req.get('user-agent'),
        });
    });
    next();
};
module.exports = { requestLogger };
//# sourceMappingURL=request.logger.js.map