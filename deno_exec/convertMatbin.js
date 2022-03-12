import { parse } from "https://deno.land/std/path/mod.ts";
import { MATBIN } from '../MATBIN.js'

for (const arg of Deno.args) {
    try {
        const parsedPath = parse(arg);
        const ext = parsedPath.ext.toLowerCase();
        switch (ext) {
            case '.matbin':
            case '.json':
                break;
            default:
                throw new Error('Not a .matbin or a .json file');
        }
        Deno.chdir(parsedPath.dir);
        if (ext === '.json') {
            const json = new TextDecoder().decode(Deno.readFileSync(parsedPath.base));
            const matbin = MATBIN.fromJSON(json);
            const outputFileName = parsedPath.name.endsWith('.matbin') ? parsedPath.name : parsedPath.name + '.matbin';
            try {
                if (Deno.statSync(outputFileName).isFile) {
                    let exist = false;
                    try {
                        exist = Deno.statSync(outputFileName + '.bak').isFile;
                    } catch (error) {}
                    if (!exist) {
                        Deno.copyFileSync(outputFileName, outputFileName + '.bak');
                    }
                }
            } catch (error) {}
            Deno.writeFileSync(outputFileName, matbin.exportBinary());
            console.log(`Converted \x1b[32m${arg}\x1b[39m to \x1b[32m${outputFileName}\x1b[39m`);
            continue;
        }
        const fileData = Deno.readFileSync(parsedPath.base);
        const json = new MATBIN(fileData).toJSON();
        Deno.writeFileSync(parsedPath.base + '.json', new TextEncoder().encode(json));
        console.log(`Converted \x1b[32m${arg}\x1b[39m to \x1b[32m${parsedPath.base + '.json'}\x1b[39m`);
    } catch (error) {
        console.error(`Failed to process ${arg}`)
        console.error(error.stack);
    }
}