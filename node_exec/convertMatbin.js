/// <reference lib="es2020" />
// @ts-check

import * as fs from 'fs'
import * as path from 'path'

import { MATBIN } from '../MATBIN.js'

for (let i = 2; i < process.argv.length; ++i) {
    try {
        const parsedPath = path.parse(process.argv[i]);
        const ext = parsedPath.ext.toLowerCase();
        switch (ext) {
            case '.matbin':
            case '.json':
                break;
            default:
                throw new Error('Not a .matbin or a .json file');
        }
        process.chdir(parsedPath.dir);
        if (ext === '.json') {
            const json = fs.readFileSync(parsedPath.base, { encoding: 'utf8' });
            const matbin = MATBIN.fromJSON(json);
            const outputFileName = parsedPath.name.endsWith('.matbin') ? parsedPath.name : parsedPath.name + '.matbin';
            try {
                if (fs.statSync(outputFileName).isFile()) {
                    let exist = false;
                    try {
                        exist = fs.statSync(outputFileName + '.bak').isFile();
                    } catch (error) {}
                    if (!exist) {
                        fs.copyFileSync(outputFileName, outputFileName + '.bak');
                    }
                }
            } catch (error) {}
            
            fs.writeFileSync(outputFileName, matbin.exportBinary());
            console.log(`Converted \x1b[32m${process.argv[i]}\x1b[39m to \x1b[32m${outputFileName}\x1b[39m`);
            continue;
        }
        const fileData = Uint8Array.from(fs.readFileSync(parsedPath.base));
        const json = new MATBIN(fileData).toJSON();
        fs.writeFileSync(parsedPath.base + '.json', json);
        console.log(`Converted \x1b[32m${process.argv[i]}\x1b[39m to \x1b[32m${parsedPath.base + '.json'}\x1b[39m`);
    } catch (error) {
        console.error(`Failed to process ${process.argv[i]}`)
        console.error(error.stack);
    }
}