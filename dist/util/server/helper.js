"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function normalizePort(portVal) {
    const port = parseInt(portVal, 10);
    if (!isNaN(port) && port >= 0)
        return port;
    return 3000;
}
//# sourceMappingURL=helper.js.map