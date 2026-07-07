"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Logger } = require('./Logger');
/**
 * Global Express error handling middleware.
 */
const errorLogger = (err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    const statusCode = err.statusCode || 500;
    Logger.error(err.message || 'Internal Server Error', {
        requestId: req.requestId,
        userId: req.user?.userId,
        Method: req.method,
        Url: req.originalUrl,
        Stack: err.stack,
        Body: req.body,
        Query: req.query,
        Params: req.params,
    });
    res.status(statusCode).json({
        error: {
            message: err.message || 'Internal Server Error',
        },
    });
};
module.exports = { errorLogger };
//# sourceMappingURL=error.logger.js.map