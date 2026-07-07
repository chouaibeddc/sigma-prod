"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jwt = require('jsonwebtoken');
exports.auth = (req, res, next) => {
    const accessToken = req.header('Authorization')?.split(' ')[1];
    if (!accessToken) {
        return res.status(401).json({
            code: 'TOKEN_MISSING',
            error: 'Access denied. No token provided.',
        });
    }
    try {
        const decoded = jwt.verify(accessToken, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    }
    catch (err) {
        //console.log('JWT ERROR:', err.message);
        res.status(401).json({
            code: 'TOKEN_INVALID',
            error: 'Access denied. Invalid token.',
        });
    }
};
//# sourceMappingURL=auth.js.map