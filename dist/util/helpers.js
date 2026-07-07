"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function isHumanReadableTime(value) {
    const regex = /^\d+(s|m|h|d)$/i;
    const value_ = value.trim();
    if (regex.test(value_)) {
        return value_;
    }
}
module.exports = { isHumanReadableTime };
//# sourceMappingURL=helpers.js.map