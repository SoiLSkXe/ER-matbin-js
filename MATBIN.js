/// <reference lib="es2020" />
// @ts-check

/** @type {Set<string>} */
const checksumHintSet = new Set();
/**
 * For testing
 * @returns {Set<string>}
 */
export const getChecksumHiSet = () => checksumHintSet;

/**
 * Get utf16 bytes from offset to the first NUL character('\0')
 * @param {Uint8Array} data 
 * @param {number} offset 
 * @returns {Uint8Array}
 */
const getUtf16Bytes = (data, offset = 0) => {
    const view = new DataView(data.buffer, data.byteOffset + offset);
    let len = 0;
    for (; view.getUint16(len); len += 2);
    return new Uint8Array(data.buffer, data.byteOffset + offset, len);
}

/**
 * 
 * @param {string} str 
 * @param {boolean} [isLittleEndian = false]
 * @returns {Uint8Array} Encoded utf16 bytes
 */
const encodeUtf16 = (str, isLittleEndian = false) => Uint8Array.from(
    Array.from(str, v => v.split('').map(v => v.charCodeAt(0)))
        .flatMap(v => v)
        .flatMap(v => isLittleEndian ? [v & 0xFF, v >>> 8] : [v >>> 8, v & 0xFF])
)

/**
 * 
 * @param {Uint8Array} data 
 * @param {boolean} [isLittleEndian = false]
 * @returns {string} Decoded utf16 string
 */
const decodeUtf16 = (data, isLittleEndian = false) => {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    if (view.byteLength & 1) {
        throw new Error('Utf16 data must consist of an even number of bytes')
    }
    return String.fromCharCode(...new Uint16Array(view.byteLength >> 1).map((_, i) => view.getUint16(i << 1, isLittleEndian)));
}

/**
 * For revealing checksum algorithm
 * @param {Uint8Array} data 
 * @param {number} checksum 
 * @returns {number} Initial value of checksum
 */
const reverseChecksum = (data, checksum) => {
    //console.log(data);
    let hi = checksum >>> 16;
    let low = checksum & 0xFFFF;
    let count = 0;
    let carry = 0;
    let carry2 = 0;
    for (let i = data.length, j = 1; i--; ++j) {
        const c = data[i];
        low -= c;
        hi -= (c * j);
        //hi -= 2;
        ++count;
        //hi = (((hi & 0xFF) << 8) | (hi >>> 8));
        if (low < 0) ++carry;
        if (hi < 0) ++carry2;
        low &= 0xFFFF;
        hi &= 0xFFFF;
    }
    hi -= count;
    hi &= 0xFFFF;
    //checksumHiSet.add(`${count/2},${hi/0xf},${carry},${carry2}`);
    console.log(`${count / 2},${hi / 0xf},${carry},${carry2}`)
    console.log((((hi - 0xF * carry2) << 16) | low) >>> 0)
    return ((hi << 16) | low) >>> 0;
}

/**
 * Compute checksums used in matbin files
 * @param {Uint8Array} data - Data to calculate checksum
 * @returns {number} Computed checksum
 */
const computeChecksum = data => {
    let hi = 0;
    let low = 1;
    for (let i = data.length, j = 1; i--; ++j) {
        const c = data[i];
        low += c;
        hi += c * j + 1;
    }
    if (low > 0xFFFF) {
        console.warn([
            '[computeChecksum] The sum of the given bytes',
            `utf16: ${decodeUtf16(data)}`,
            'exceeds 0xFFFF.',
            'Please consider using shorter data as it is not known how to handle digits overflowing from 2 bytes'
        ].join('\r\n'));
    }
    const carry = hi >>> 16;
    hi &= 0xFFFF;
    hi += carry * 0xF;

    // Pretty weird that this operation is necessary
    // This implementation may not be the correct calculation procedure
    if (hi + 0xF > 0xFFFF) hi = (hi & 0xFFFF) + 0xF;

    return ((hi << 16) | (low & 0xFFFF)) >>> 0;
}

// Better to rewrite by using Stream API or introducing a binary reader module
export class MATBIN {

    /**
     * @type {Map<number, {type: string, size: number}>}
     */
    static parameterTypeMap = new Map([
        [0x00, {type: 'bool', size: 1}],
        [0x04, {type: 'int', size: 1}],
        [0x05, {type: 'int', size: 2}],
        [0x08, {type: 'float', size: 1}],
        [0x09, {type: 'float', size: 2}],
        [0x0A, {type: 'float', size: 5}], // Compared to the MTD format, this seems to correspond to foat3, but the actual size of the data contained is 5
        [0x0B, {type: 'float', size: 4}], // Mainly used for parameters associated with glow
        [0x0C, {type: 'float', size: 5}]  // Compared to the MTD format, this seems to correspond to foat4, but the actual size of the data contained is 5
    ])

    /** @type {string} */
    #shaderPath = 'default.spx';
    /** @type {string} */
    #xmlPath = 'default.matxml';

    /** @type {Map<string, {type: number, values: number[]}>} */
    #parameters = new Map();

    /** @type {Map<string, {path: string, floats: number[]}>} */
    #textures = new Map();

    /**
     * Create an empty MATBIN instance, or create a MATBIN instance from a matbin file
     * @param {Uint8Array | null} [data = null] - (Optional) Bytes of a matbin file
     */
    constructor(data = null) {
        if (!data) {
            return;
        }
        const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
        const magic = String.fromCharCode(...data.slice(0, 4));
        if (magic !== 'MAB\0') {
            throw new Error('Not a MATBIN file');
        }

        const version = view.getUint32(4, true);
        let readBytes = 4;
        if (version !== 0x00000002) {
            throw new Error(`Unknonw version: ${version}`);
        }
        readBytes += 4;
        const shaderPathOffset = view.getUint32(8, true);
        readBytes += 4;
        this.#shaderPath = decodeUtf16(getUtf16Bytes(data, shaderPathOffset), true);
        if (view.getUint32(readBytes, true)) {
            throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}: ${view.getUint32(readBytes, true)}`);
        }
        readBytes += 4;
        const xmlPathOffset = view.getUint32(readBytes, true);
        readBytes += 4;
        const xmlPathData = getUtf16Bytes(data, xmlPathOffset);
        this.#xmlPath = decodeUtf16(xmlPathData, true);
        if (view.getUint32(readBytes, true)) {
            throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}: ${view.getUint32(readBytes, true)}`);
        }
        readBytes += 4;
        const checksum = view.getUint32(0x18, true);
        readBytes += 4;
        //reverseChecksum(xmlPathData, checksum);
        if (computeChecksum(xmlPathData) !== checksum) {
            //reverseChecksum(xmlPathData, computeChecksum(xmlPathData));
            throw new Error([
                `Checksum mismatch@0x${readBytes.toString(16)}`,
                `dataString: ${this.#xmlPath}`,
                `computed Checksum: 0x${computeChecksum(xmlPathData).toString(16).padStart(8, '0')}`,
                `declared Checksum: 0x${checksum.toString(16).padStart(8, '0')}`
            ].join('\r\n'));
        }
        //console.log([this.#xmlPath, checksum.toString(16), reverseChecksum(xmlPathData, checksum).toString(16)]);
        const parameterCount = view.getUint32(readBytes, true);
        readBytes += 4;
        const textureCount = view.getUint32(readBytes, true);
        readBytes += 4;
        for (let i = 0; i < 5; ++i) {
            if (view.getUint32(readBytes, true)) {
                throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}: ${view.getUint32(readBytes, true)}`);
            }
            readBytes += 4;
        }
        //let readBytes = 0x38;

        for (let i = 0; i < parameterCount; ++i) {
            const entryOffset = readBytes;
            const parameterNameOffset = view.getUint32(readBytes, true);
            const parameterNameData = getUtf16Bytes(data, parameterNameOffset);
            const parameterName = decodeUtf16(parameterNameData, true);
            readBytes += 4;
            if (view.getUint32(readBytes, true)) {
                throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
            }
            readBytes += 4;
            const parameterValueOffset = view.getUint32(readBytes, true);
            readBytes += 4;
            if (view.getUint32(readBytes, true)) {
                throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
            }
            readBytes += 4;
            const checksum = view.getUint32(readBytes, true);
            readBytes += 4;
            //reverseChecksum(parameterNameData, checksum);
            if (computeChecksum(parameterNameData) !== checksum) {
                //reverseChecksum(parameterNameData, computeChecksum(parameterNameData));
                throw new Error([
                    `Checksum mismatch@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}):`,
                    `dataString: ${parameterName}`,
                    `computed Checksum: 0x${computeChecksum(parameterNameData).toString(16).padStart(8, '0')}`,
                    `declared Checksum: 0x${checksum.toString(16).padStart(8, '0')}`
                ].join('\r\n'));
            }
            const parameterType = view.getUint32(readBytes, true);
            if (!MATBIN.parameterTypeMap.has(parameterType)) {
                throw new Error(`Unknown parameter type@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${parameterType}`);
            }

            const value = [];

            switch (MATBIN.parameterTypeMap.get(parameterType).type) {
                case 'bool':
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(parameterType).size; ++i) {
                        value.push(view.getUint8(parameterValueOffset + i));
                    }
                    break;
                case 'int':
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(parameterType).size; ++i) {
                        value.push(view.getInt32(parameterValueOffset + (i << 2), true));
                    }
                    break;
                case 'float':
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(parameterType).size; ++i) {
                        value.push(view.getFloat32(parameterValueOffset + (i << 2), true));
                    }
                    break;
                default:
                    throw new Error(`Unknown parameter type@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${parameterType}`);
            }

            //console.log([parameterName, parameterType, MATBIN.typeMap.get(parameterType), checksum.toString(16), reverseChecksum(parameterNameData, checksum).toString(16)]);
            readBytes += 4;
            for (let j = 0; j < 4; ++j) {
                if (view.getUint32(readBytes, true)) {
                    throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(paramEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
                }
                readBytes += 4;
            }

            this.#parameters.set(parameterName, {
                type: parameterType,
                values: value
            })
        }

        for (let i = 0; i < textureCount; ++i) {
            const entryOffset = readBytes;
            const textureTypeNameOffset = view.getUint32(readBytes, true);
            const textureTypeNameData = getUtf16Bytes(data, textureTypeNameOffset);
            const textureTypeName = decodeUtf16(textureTypeNameData, true);
            readBytes += 4;
            if (view.getUint32(readBytes, true)) {
                throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(textureEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
            }
            readBytes += 4;
            const texturePathOffset = view.getUint32(readBytes, true);
            const texturePath = decodeUtf16(getUtf16Bytes(data, texturePathOffset), true);
            readBytes += 4;
            if (view.getUint32(readBytes, true)) {
                throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(textureEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
            }
            readBytes += 4;
            const checksum = view.getUint32(readBytes, true);
            //reverseChecksum(textureTypeNameData, checksum);
            if (computeChecksum(textureTypeNameData) !== checksum) {
                //reverseChecksum(textureTypeNameData, computeChecksum(textureTypeNameData));
                throw new Error([
                    `Checksum mismatch@0x${readBytes.toString(16)}(textureEntry#${i}, 0x${(readBytes - entryOffset).toString(16)})`,
                    `dataString: ${textureTypeName}`,
                    `computed Checksum: 0x${computeChecksum(textureTypeNameData).toString(16).padStart(8, '0')}`,
                    `declared Checksum: 0x${checksum.toString(16).padStart(8, '0')}`
                ].join('\r\n'));
            }
            //console.log([textureTypeName, texturePath, checksum.toString(16), reverseChecksum(textureTypeNameData, checksum).toString(16)]);
            readBytes += 4;
            const float1 = view.getFloat32(readBytes, true);
            readBytes += 4;
            const float2 = view.getFloat32(readBytes, true);
            readBytes += 4;
            for (let j = 0; j < 5; ++j) {
                if (view.getUint32(readBytes, true)) {
                    throw new Error(`Expected zero but got non-zero value@0x${readBytes.toString(16)}(textureEntry#${i}, 0x${(readBytes - entryOffset).toString(16)}): ${view.getUint32(readBytes, true)}`);
                }
                readBytes += 4;
            }
            this.#textures.set(textureTypeName, {
                path: texturePath,
                floats: [float1, float2]
            });
        }
        //console.log(readBytes, view.getUint32(0x38, true));
    }

    /** 
     * @typedef {object} matbinParameter - Object describing a matbin parameter entry
     * @prop {string} name - Parameter's name
     * @prop {number} type - Integer describing the data type of the parameter
     * @prop {number[]} values - Numeric values of the parameter
     * @prop {string} [typeDescription = ''] - (Optional) Description of data type
    */
    /** 
     * @typedef {object} matbinTexture - Object describing a matbin texture entry
     * @prop {string} type - Texture's type
     * @prop {string} path - Path to the texture image file
     * @prop {number[]} floats - Unknown float2
    */
    /**
     * @typedef {object} matbinObject - Object describing a matbin file
     * @prop {string} shaderPath - Path to shader file 
     * @prop {string} xmlPath - 
     * @prop {matbinParameter[]} parameters - Parameter object array of the matbin
     * @prop {matbinTexture[]} textures - Texture object array of the matbin
     */
    /**
     * Export a MATBIN instance to a matbinObject
     * @returns {matbinObject}
     */
    toObject() {
        return {
            shaderPath: this.#shaderPath,
            xmlPath: this.#xmlPath,
            parameters: Array.from(this.#parameters, ([name, { type, values }]) => {
                return {
                    name,
                    type,
                    values: values.slice(),
                    typeDescription: `${MATBIN.parameterTypeMap.get(type).type}${MATBIN.parameterTypeMap.get(type).size > 1 ? MATBIN.parameterTypeMap.get(type).size : ''}`
                }
            }),
            textures: Array.from(this.#textures, ([type, { path, floats }]) => {
                return {
                    type,
                    path,
                    floats: floats.slice()
                }
            })
        }
    }

    /**
     * Export a MATBIN instance to a JSON string
     * @returns {string} JSON string
     */
    toJSON() {
        return JSON.stringify({
            shaderPath: this.#shaderPath,
            xmlPath: this.#xmlPath,
            parameters: Array.from(this.#parameters, ([name, { type, values }]) => {
                return {
                    name,
                    type,
                    values: values.slice(),
                    typeDescription: `${MATBIN.parameterTypeMap.get(type).type}${MATBIN.parameterTypeMap.get(type).size > 1 ? MATBIN.parameterTypeMap.get(type).size : ''}`
                }
            }),
            textures: Array.from(this.#textures, ([type, { path, floats }]) => {
                return {
                    type,
                    path,
                    floats: floats.slice()
                }
            })
        }, null, '    ');
    }



    /**
     * Create a MATBIN instance from a matbinObject
     * @param {matbinObject} matbinObject - 
     * @returns {MATBIN}
     */
    static fromObject({ shaderPath = '', xmlPath = '', parameters = [], textures = [] }) {
        const matbin = new MATBIN();
        matbin.#shaderPath = shaderPath;
        matbin.#xmlPath = xmlPath;
        matbin.#parameters = new Map(parameters.map(param => [param.name, { type: param.type, values: param.values.slice() }]));
        matbin.#textures = new Map(textures.map(texture => [texture.type, { path: texture.path, floats: texture.floats.slice() }]));
        return matbin;
    }

    /**
     * Create a MATBIN instance from a matbinObject
     * @param {string} jsonString - 
     * @returns {MATBIN}
     */
    static fromJSON(jsonString) {
        const matbinObj = JSON.parse(jsonString);
        const matbin = new MATBIN();
        matbin.#shaderPath = matbinObj.shaderPath || '';
        matbin.#xmlPath = matbinObj.xmlPath || '';
        matbin.#parameters = new Map((matbinObj.parameters || []).map(param => [param.name, { type: param.type, values: param.values.slice() }]));
        matbin.#textures = new Map((matbinObj.textures || []).map(texture => [texture.type, { path: texture.path, floats: texture.floats.slice() }]));
        return matbin;
    }

    exportBinary() {
        const headerSize = 0x38 + 0x28 * this.#parameters.size + 0x30 * this.#textures.size;
        const header = new Uint8Array(headerSize);
        const data = [];
        let dataSize = headerSize;
        const view = new DataView(header.buffer);
        view.setUint32(0, 0x4D414200);
        view.setUint32(4, 0x02000000);
        view.setUint32(0x1C, this.#parameters.size, true);
        view.setUint32(0x20, this.#textures.size, true);

        let entryOffset = 0x38
        for (const [name, { type, values }] of this.#parameters) {
            view.setUint32(entryOffset, dataSize, true);
            const parameterNameData = encodeUtf16(name + '\0', true);
            data.push(parameterNameData);
            dataSize += parameterNameData.byteLength;

            view.setUint32(entryOffset + 8, dataSize, true);
            /** @type {Uint8Array} */
            let valueData;
            switch (MATBIN.parameterTypeMap.get(type).type) {
                case 'bool':
                    valueData = new Uint8Array(MATBIN.parameterTypeMap.get(type).size);
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(type).size; ++i) {
                        valueData[i] = values[i] ? 1 : 0;
                    }
                    break;
                case 'int':
                    valueData = new Uint8Array(MATBIN.parameterTypeMap.get(type).size << 2);
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(type).size; ++i) {
                        new DataView(valueData.buffer).setInt32(i << 2, values[i], true);
                    }
                    break;
                case 'float':
                    valueData = new Uint8Array(MATBIN.parameterTypeMap.get(type).size << 2);
                    for (let i = 0; i < MATBIN.parameterTypeMap.get(type).size; ++i) {
                        new DataView(valueData.buffer).setFloat32(i << 2, values[i], true);
                    }
                    break;
                default:
                    throw new Error(`Unknown parameter type: ${type}`);
            }
            data.push(valueData);
            dataSize += valueData.byteLength;
            view.setUint32(entryOffset + 0x10, computeChecksum(new Uint8Array(parameterNameData.buffer, parameterNameData.byteOffset, parameterNameData.byteLength - 2)), true);
            view.setUint32(entryOffset + 0x14, type, true);
            entryOffset += 0x28;
        }
        //const textureEntryOffset = entryOffset;
        for (const [type, { path, floats }] of this.#textures) {
            view.setUint32(entryOffset, dataSize, true);
            const textureTypeNameData = encodeUtf16(type + '\0', true);
            data.push(textureTypeNameData);
            dataSize += textureTypeNameData.byteLength;

            view.setUint32(entryOffset + 8, dataSize, true);
            const texturePathData = encodeUtf16(path + '\0', true);
            data.push(texturePathData);
            dataSize += texturePathData.byteLength;

            view.setUint32(entryOffset + 0x10, computeChecksum(new Uint8Array(textureTypeNameData.buffer, textureTypeNameData.byteOffset, textureTypeNameData.byteLength - 2)), true);
            view.setFloat32(entryOffset + 0x14, floats[0], true);
            view.setFloat32(entryOffset + 0x18, floats[1], true);
            entryOffset += 0x30;
        }

        const shaderPathData = encodeUtf16(this.#shaderPath + '\0', true);
        view.setUint32(8, dataSize, true);
        data.push(shaderPathData);
        dataSize += shaderPathData.byteLength;

        const xmlPathData = encodeUtf16(this.#xmlPath + '\0', true);
        view.setUint32(0x10, dataSize, true);
        data.push(xmlPathData);
        dataSize += xmlPathData.byteLength;

        view.setUint32(0x18, computeChecksum(new Uint8Array(xmlPathData.buffer, xmlPathData.byteOffset, xmlPathData.byteLength - 2)), true);

        const result = new Uint8Array(dataSize);
        result.set(header);
        let writtenBytes = headerSize;
        for (let i = 0; i < data.length; ++i) {
            result.set(data[i], writtenBytes);
            writtenBytes += data[i].byteLength;
        }
        return result;
    }

    getShaderPath() {
        return this.#shaderPath;
    }

    setShaderPath(path) {
        this.#shaderPath = path;
        return this;
    }

    getXmlPath() {
        return this.#xmlPath;
    }

    setXmlPath(path) {
        this.#xmlPath = path;
        return this;
    }

    /**
     * 
     * @param {string} name 
     * @returns {matbinParameter}
     */
    getParameter(name) {
        if (!this.#parameters.has(name)) {
            throw new Error(`Parameter ${name} not exists`);
        }
        const param = this.#parameters.get(name);
        return {
            name,
            type: param.type,
            values: param.values.slice()
        }
    }

    /**
     * 
     * @returns {matbinParameter[]}
     */
    getParameters() {
        return Array.from(this.#parameters, ([name, { type, values }]) => {
            return {
                name,
                type,
                values: values.slice(),
                typeDescription: `${MATBIN.parameterTypeMap.get(type).type}${MATBIN.parameterTypeMap.get(type).size > 1 ? MATBIN.parameterTypeMap.get(type).size : ''}`
            }
        })
    }

    /**
     * 
     * @param {string} name 
     * @param {number} type 
     * @param {number[]} values 
     * @param {boolean} [overwrite = false]
     * @returns {MATBIN}
     */
    addParameter(name, type, values, overwrite = false) {
        if (this.#parameters.has(name) && !overwrite) {
            throw new Error(`Parameter ${name} already exists`);
        }
        this.#parameters.set(name, { type, values: values.slice() });
        return this;
    }

    /**
     * 
     * @param  {...string} parameterName 
     * @returns {MATBIN}
     */
    deleteParameter(...parameterName) {
        for (const name of parameterName) {
            this.#parameters.delete(name)
        }
        return this;
    }

    /**
     * 
     * @param {string} before 
     * @param {string} after 
     * @param {boolean} [overwrite = false]
     * @returns {MATBIN}
     */
    renameParameter(before, after, overwrite = false) {
        if (!this.#parameters.has(before)) return this;
        if (before === after) return this;
        if (this.#parameters.has(after)) {
            if (!overwrite) {
                throw new Error(`Parameter ${after} already exists`);
            }
            this.#parameters.delete(after)
        }
        this.#parameters = new Map(Array.from(this.#parameters, ([key, value]) => key === before ? [after, value] : [key, value]));
        return this;
    }

    /**
     * 
     * @param {string} name 
     * @param {number} type 
     * @param {number[]} [values = []]
     * @returns {MATBIN}
     */
     setParameterType(name, type, values = []) {
        if (!this.#parameters.has(name)) {
            throw new Error(`Parameter ${name} not exists`);
        }
        if (!MATBIN.parameterTypeMap.has(type)) {
            throw new Error(`Unsupported parameter type: ${type}`);
        }
        const param = this.#parameters.get(name);
        param.type = type;
        const newValues = [];
        for (let i = 0; i < MATBIN.parameterTypeMap.get(type).size; ++i) {
            newValues.push(0);
        }
        for (let i = 0; i < newValues.length; ++i) {
            if (i >= param.values.length) break;
            newValues[i] = param.values[i]
        }
        for (let i = 0; i < newValues.length; ++i) {
            if (i >= values.length) break;
            newValues[i] = values[i]
        }
        param.values = newValues;
        return this;
    }

    /**
     * 
     * @param {string} name 
     * @param {number[]} values 
     * @returns {MATBIN}
     */
    setParameterValues(name, values) {
        if (!this.#parameters.has(name)) {
            throw new Error(`Parameter ${name} not exists`);
        }
        const param = this.#parameters.get(name);
        for (let i = 0; i < param.values.length; ++i) {
            if (i >= values.length) break;
            param.values[i] = values[i];
        }
        return this;
    }

    /**
     * 
     * @param {string} type 
     * @returns {matbinTexture}
     */
    getTexture(type) {
        if (!this.#textures.has(type)) {
            throw new Error(`Texture type ${type} not exists`);
        }
        const texture = this.#textures.get(type);
        return {
            type,
            path: texture.path,
            floats: texture.floats.slice()
        }
    }

    /**
     * 
     * @returns {matbinTexture[]}
     */
    getTextures() {
        return Array.from(this.#textures, ([type, { path, floats }]) => {
            return {
                type,
                path,
                floats: floats.slice()
            }
        })
    }

    /**
     * 
     * @param {string} type 
     * @param {object} parameters
     * @param {string} [parameters.path = '']
     * @param {number[]} [parameters.floats = [0, 0]]
     * @param {boolean} [overwrite = false]
     * @returns {MATBIN}
     */
    addTexture(type, { path = '', floats = [0, 0] } = {}, overwrite = false) {
        if (this.#textures.has(type) && !overwrite) {
            throw new Error(`Texture type ${type} already exists`);
        }
        this.#textures.set(type, { path, floats: floats.slice() });
        return this
    }

    /**
     * 
     * @param  {...string} textureType 
     * @returns {MATBIN}
     */
    deleteTexture(...textureType) {
        for (const type of textureType) {
            this.#textures.delete(type);
        }
        return this;
    }

    /**
     * 
     * @param {string} before 
     * @param {string} after 
     * @param {boolean} [overwrite = false]
     * @returns {MATBIN}
     */
    renameTextureType(before, after, overwrite = false) {
        if (!this.#textures.has(before)) return this;
        if (before === after) return this;
        if (this.#textures.has(after)) {
            if (!overwrite) {
                throw new Error(`Texture type ${after} already exists`);
            }
            this.#textures.delete(after)
        }
        this.#textures = new Map(Array.from(this.#textures, ([key, value]) => key === before ? [after, value] : [key, value]));
        return this;
    }

    /**
     * 
     * @param {string} type 
     * @param {string} path 
     * @returns {MATBIN}
     */
    setTexturePath(type, path) {
        if (!this.#textures.has(type)) {
            throw new Error(`Texture type ${type} not exists`);
        }
        const texture = this.#textures.get(type);
        texture.path = path;
        return this;
    }

    /**
     * 
     * @param {string} type 
     * @param {number} float1
     * @param {number} float2
     * @returns {MATBIN}
     */
    setTextureFloats(type, float1, float2) {
        if (!this.#textures.has(type)) {
            throw new Error(`Texture type ${type} not exists`);
        }
        const texture = this.#textures.get(type);
        texture.floats = [float1, float2];
        return this;
    }
}