"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const console = require("node:console");
const { Privilege_enum } = require('../@types');
// exports.accessControl = (privilege: Privilege) => {
//     return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
//         const userPrivileges = req?.user?.privileges;
//         console.log(userPrivileges);
//         if (
//             !userPrivileges ||
//             !userPrivileges.includes(privilege) ||
//             !userPrivileges.includes(Privilege_enum.SUPER)
//         ) {
//             return res.status(403).json({
//                 error: 'Access denied. Forbidden',
//             });
//         }
//         next();
//     };
// };
exports.accessControl = (privilege) => {
    return (req, res, next) => {
        const userPrivileges = req?.user?.privileges;
        // 1. Always check if privileges exist first
        if (!userPrivileges) {
            return res
                .status(403)
                .json({ error: 'Access denied. No privileges found.' });
        }
        // 2. THE FIX: Check if they LACK the specific privilege AND LACK Super status
        const hasRequiredPrivilege = userPrivileges.includes(privilege);
        const isSuperUser = userPrivileges.includes(Privilege_enum.SUPER);
        if (!hasRequiredPrivilege && !isSuperUser) {
            return res.status(403).json({
                error: 'Access denied. Forbidden',
            });
        }
        next();
    };
};
exports.accessEntityControl = (req, res, next) => {
    const userPrivileges = req?.user?.privileges;
    // Example:
    // /route?entity=Client
    const entity = (req.query.entity || req.body.entity);
    // Check if privileges exist
    if (!userPrivileges) {
        return res.status(403).json({
            error: 'Access denied. No privileges found.',
        });
    }
    // Check if query param exists
    if (!entity) {
        return res.status(400).json({
            error: 'Missing query parameter: entity',
        });
    }
    // Generate dynamic privilege
    // Client -> MANAGE_CLIENT
    // user-profile -> MANAGE_USER_PROFILE
    const requiredPrivilege = `MANAGE_${entity
        .replace(/[-\s]+/g, '_')
        .toUpperCase()}`;
    // Validate privilege exists in enum
    const isValidPrivilege = Object.values(Privilege_enum).includes(requiredPrivilege);
    if (!isValidPrivilege) {
        return res.status(400).json({
            error: 'Invalid entity.',
        });
    }
    // Check permissions
    const hasRequiredPrivilege = userPrivileges.includes(requiredPrivilege);
    const isSuperUser = userPrivileges.includes(Privilege_enum.SUPER);
    if (!hasRequiredPrivilege && !isSuperUser) {
        return res.status(403).json({
            error: `Access denied. Required privilege: ${requiredPrivilege}`,
        });
    }
    next();
};
//# sourceMappingURL=access.js.map