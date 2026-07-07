"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { Privilege_enum } = require('../@types/index');
exports.verifyMetaZZ = (req) => req?.user?.privileges?.includes(Privilege_enum.SUPER) || false;
//# sourceMappingURL=meta.zz.verify.js.map