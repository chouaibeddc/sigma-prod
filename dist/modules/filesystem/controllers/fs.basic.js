"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const path = require('path');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const STORAGE_PATH = path.join(__dirname, '../../../../storage/');
exports.upload = (req, res, next) => { };
exports.load = (req, res, next, working_path = '/') => {
    const filename = req.params.filename;
    const directoryPath = path.join(STORAGE_PATH, working_path);
    const fullPath = path.join(directoryPath, filename);
    // Check if the file exists on the disk
    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (err) {
            // File does not exist
            return res.status(404).json({
                error: 'File not found',
            });
        }
        // File exists, proceed to send it
        res.sendFile(filename, { root: directoryPath }, (err) => {
            if (err) {
                // This catches issues that happen during the actual streaming of the file
                if (!res.headersSent) {
                    return res
                        .status(500)
                        .json({ error: 'Could not transmit image' });
                }
            }
        });
    });
};
//# sourceMappingURL=fs.basic.js.map