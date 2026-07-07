"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const bcrypt = require("bcrypt");
const SALT_ROUNDS = 12;
async function passwordHash(password) {
    return bcrypt.hash(password, SALT_ROUNDS);
}
passwordHash("test2009").then((data) => {
    console.log(data);
});
module.exports = passwordHash;
//# sourceMappingURL=passwordHash.js.map