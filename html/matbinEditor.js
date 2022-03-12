/// <reference lib="es2020" />
// @ts-check

import { MATBIN } from '../MATBIN.js'

let matbin = new MATBIN();

const fileBaseNameForm = /** @type {HTMLInputElement} */(document.getElementById('fileBaseNameForm'));
const dropFrame = /** @type {HTMLDivElement} */(document.getElementById('DropFrame'));
const exportMatbinButton = /** @type {HTMLInputElement} */(document.getElementById('exportMatbinButton'));
const exportJSONButton = /** @type {HTMLInputElement} */(document.getElementById('exportJSONButton'));
const shaderPathForm = /** @type {HTMLInputElement} */(document.getElementById('shaderPathForm'));
const xmlPathForm = /** @type {HTMLInputElement} */(document.getElementById('xmlPathForm'));
const parameterTable = /** @type {HTMLTableElement} */(document.getElementById('parameterTable'));
const textureTable = /** @type {HTMLTableElement} */(document.getElementById('textureTable'));
const addParameterButton = /** @type {HTMLTableElement} */(document.getElementById('addParameterButton'));
const addTextureButton = /** @type {HTMLTableElement} */(document.getElementById('addTextureButton'));

const paramTypeDescriptionMap = new Map(Array.from(MATBIN.parameterTypeMap, ([key, {type, size}]) => [key, `${key}(${type}${size === 1 ? '' : size})`]));
//console.log(paramTypeDescriptionMap);

/**
 * 
 * @param {HTMLInputElement} paramNameInputElement 
 * @param {HTMLSelectElement} paramTypeSelectElement 
 * @param {HTMLInputElement[]} valueInputElements 
 * @param {HTMLInputElement} deleteButton 
 */
const setParameterEntryEventListeners = (paramNameInputElement, paramTypeSelectElement, valueInputElements, deleteButton) => {
    deleteButton.addEventListener('click', (evt) => {
        matbin.deleteParameter(paramNameInputElement.value);
        deleteButton.parentNode.parentNode.parentNode.removeChild(deleteButton.parentNode.parentNode);
    });

    paramNameInputElement.addEventListener('change', (() => {
        let prevValue = paramNameInputElement.value;
        return (evt) => {
            try {
                matbin.renameParameter(prevValue, paramNameInputElement.value, false);
                prevValue = paramNameInputElement.value;
            } catch (error) {
                alert(error.message);
                paramNameInputElement.value = prevValue;
            }
        }
    })());

    paramTypeSelectElement.addEventListener('change', (evt) => {
        const typeValue = parseInt(paramTypeSelectElement.value);
        const {type, size} = MATBIN.parameterTypeMap.get(typeValue);
        /** @type {number[]} */
        const newValues = [];
        for (let i = 0; i < valueInputElements.length; ++i) {
            const valueInputElement = valueInputElements[i];
            if (i >= size) {
                valueInputElement.disabled = true;
                continue;
            }
            valueInputElement.disabled = false;
            switch (type) {
                case 'bool':
                    valueInputElement.step = '1';
                    valueInputElement.min = '0';
                    valueInputElement.max = '1';
                    valueInputElement.valueAsNumber = valueInputElement.valueAsNumber ? 1 : 0;
                    break;
                case 'int':
                    valueInputElement.step = '1';
                    valueInputElement.min = '-2147483648';
                    valueInputElement.max = '2147483647';
                    if (isNaN(valueInputElement.valueAsNumber)) valueInputElement.valueAsNumber = 0;
                    valueInputElement.valueAsNumber |= 0;
                    break;
                case 'float':
                    valueInputElement.step = 'any';
                    valueInputElement.min = undefined;
                    valueInputElement.max = undefined;
                    break;
                default:
                    throw new Error(`Unknown parameter data type ${type}`);
            }
        }
        matbin.setParameterType(paramNameInputElement.value, typeValue, newValues);

        for (let i = 0; i < valueInputElements.length; ++i) {
            valueInputElements[i].dispatchEvent(new Event('change'));
        }
    })

    for (const valueInputElement of valueInputElements) {
        valueInputElement.addEventListener('change', (() => {
            let prevValue = valueInputElement.value;
            return (evt) => {
                try {
                    if (!valueInputElement.validity.valid || valueInputElement.value === '') {
                        valueInputElement.value = prevValue;
                        return;
                    }
                    const values = valueInputElements.map(v => v.valueAsNumber);
                    matbin.setParameterValues(paramNameInputElement.value, values);
                    prevValue = valueInputElement.value;
                } catch (error) {
                    alert(error.message);
                    valueInputElement.value = prevValue;
                }
            }
        })());
    }
}

/**
 * 
 * @param {HTMLInputElement} textureTypeInputElement 
 * @param {HTMLInputElement} texturePathInputElement 
 * @param {HTMLInputElement[]} floatInputElements 
 * @param {HTMLInputElement} deleteButton 
 */
 const setTextureEntryEventListeners = (textureTypeInputElement, texturePathInputElement, floatInputElements, deleteButton) => {
    deleteButton.addEventListener('click', (evt) => {
        matbin.deleteTexture(textureTypeInputElement.value);
        deleteButton.parentNode.parentNode.parentNode.removeChild(deleteButton.parentNode.parentNode);
    });

    textureTypeInputElement.addEventListener('change', (() => {
        let prevValue = textureTypeInputElement.value;
        return (evt) => {
            try {
                matbin.renameTextureType(prevValue, textureTypeInputElement.value, false);
                prevValue = textureTypeInputElement.value;
            } catch (error) {
                alert(error.message);
                textureTypeInputElement.value = prevValue;
            }
        }
    })());

    texturePathInputElement.addEventListener('change', (evt) => {
        matbin.setTexturePath(textureTypeInputElement.value, texturePathInputElement.value);
    });

    for (const floatInputElement of floatInputElements) {
        floatInputElement.addEventListener('change', (() => {
            let prevValue = floatInputElement.value;
            return (evt) => {
                try {
                    if (!floatInputElement.validity.valid || floatInputElement.value === '') {
                        floatInputElement.value = prevValue;
                        return;
                    }
                    const values = floatInputElements.map(v => v.valueAsNumber);
                    matbin.setTextureFloats(textureTypeInputElement.value, values[0], values[1]);
                    prevValue = floatInputElement.value;
                } catch (error) {
                    alert(error.message);
                    floatInputElement.value = prevValue;
                }
            }
        })());
    }
 }

/**
 * 
 * @param {HTMLTableRowElement} tr 
 * @param {{name: string, type: number, values: number[]}} param 
 */
const addParameterRow = (tr, param) => {
    const paramNameInputElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
    paramNameInputElement.value = param.name;
    paramNameInputElement.type = 'text';
    paramNameInputElement.size = 50;
    const paramTypeSelectElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLSelectElement} */(document.createElement('select')));
    for (const [key, value] of paramTypeDescriptionMap) {
        const option = paramTypeSelectElement.appendChild(/** @type {HTMLOptionElement} */(document.createElement('option')));
        option.innerHTML = value;
        option.value = key.toString();
        if (key === param.type) option.selected = true;
    }
    /** @type {HTMLInputElement[]} */
    const valueInputElements = [];
    for (let i = 0; i < 5; ++i) {
        const valueInputElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
        valueInputElement.type = 'number';
        switch (MATBIN.parameterTypeMap.get(param.type).type) {
            case 'bool':
                valueInputElement.step = '1';
                valueInputElement.min = '0';
                valueInputElement.max = '1';
                break;
            case 'int':
                valueInputElement.step = '1';
                valueInputElement.min = '-2147483648';
                valueInputElement.max = '2147483647';
                break;
            case 'float':
                valueInputElement.step = 'any';
                break;
            default:
                throw new Error(`Unknown parameter data type ${MATBIN.parameterTypeMap.get(param.type)}`);
        }
        valueInputElement.style.width = '6em';
        valueInputElements.push(valueInputElement);
        if (i < param.values.length) {
            valueInputElement.valueAsNumber = param.values[i];
            continue;
        }
        valueInputElement.valueAsNumber = 0;
        valueInputElement.disabled = true;
    }
    const deleteButton = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
    deleteButton.type = 'button';
    deleteButton.value = '-';
    deleteButton.style.width = '2em';

    setParameterEntryEventListeners(paramNameInputElement, paramTypeSelectElement, valueInputElements, deleteButton);
}

/**
 * 
 * @param {HTMLTableRowElement} tr 
 * @param {{type: string, path: string, floats: number[]}} texture 
 */
const addTextureRow = (tr, texture) => {
    const textureTypeInputElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
    textureTypeInputElement.value = texture.type;
    textureTypeInputElement.type = 'text';
    textureTypeInputElement.size = 50;
    const texturePathInputElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
    texturePathInputElement.value = texture.path;
    texturePathInputElement.type = 'text';
    texturePathInputElement.size = 50;
    /** @type {HTMLInputElement[]} */
    const floatInputElements = [];
    for (let i = 0; i < 2; ++i) {
        const valueInputElement = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
        valueInputElement.type = 'number';
        valueInputElement.step = 'any';
        valueInputElement.style.width = '6em';
        floatInputElements.push(valueInputElement);
        valueInputElement.valueAsNumber = texture.floats[i];
    }
    const deleteButton = tr.appendChild(document.createElement('td')).appendChild(/** @type {HTMLInputElement} */(document.createElement('input')));
    deleteButton.type = 'button';
    deleteButton.value = '-';
    deleteButton.style.width = '2em';

    setTextureEntryEventListeners(textureTypeInputElement, texturePathInputElement, floatInputElements, deleteButton);
}

const updateDOM = () => {
    shaderPathForm.value = matbin.getShaderPath();
    xmlPathForm.value = matbin.getXmlPath();
    for (const tbody of parameterTable.tBodies) {
        tbody.remove();
    }
    const parameters = matbin.getParameters();
    const paramTbody = parameterTable.appendChild(document.createElement('tbody'));
    for (const param of parameters) {
        const tr = paramTbody.appendChild(document.createElement('tr'));
        addParameterRow(tr, param);
    }
    for (const tbody of textureTable.tBodies) {
        tbody.remove();
    }
    const textures = matbin.getTextures();
    const textureTbody = textureTable.appendChild(document.createElement('tbody'));
    for (const texture of textures) {
        const tr = textureTbody.appendChild(document.createElement('tr'));
        addTextureRow(tr, texture);
    }
}

const dropFrameStyle = {
    color: dropFrame.style.color,
    backgroundColor: dropFrame.style.backgroundColor
}

/**
 * 
 * @param {File} file 
 * @returns {Promise<Uint8Array>}
 */
const readFileAsync = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(/** @type {ArrayBuffer} */(reader.result)));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file)
})

window.addEventListener('load', () => {
    dropFrame.addEventListener('dragover', (evt) => {
        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';
        dropFrame.style.color = '#3470ff';
        dropFrame.style.backgroundColor = '#b8deff';
    })
    dropFrame.addEventListener('dragleave', (evt) => {
        dropFrame.style.color = dropFrameStyle.color;
        dropFrame.style.backgroundColor = dropFrameStyle.backgroundColor;
    })
    dropFrame.addEventListener('drop', async (evt) => {
        try {
            evt.stopPropagation();
            evt.preventDefault();
            dropFrame.style.color = dropFrameStyle.color;
            dropFrame.style.backgroundColor = dropFrameStyle.backgroundColor;
            const files = evt.dataTransfer.files;
            if (files.length !== 1) {
                throw Error('Multiple files were supplied. Please supply only one file');
            }
            const file = files[0];
            const fileData = await readFileAsync(file);
            matbin = file.type === 'application/json' ? MATBIN.fromJSON(new TextDecoder().decode(fileData.buffer)) : new MATBIN(fileData);
            let fileBaseName = file.name;
            if (fileBaseName.toLowerCase().endsWith('.json')) {
                fileBaseName = fileBaseName.slice(0, -5);
            }
            if (fileBaseName.toLowerCase().endsWith('.matbin')) {
                fileBaseName = fileBaseName.slice(0, -7);
            }
            fileBaseNameForm.value = fileBaseName;

            updateDOM();

        } catch (e) {
            alert(e.message || e);
        }
    })

    exportMatbinButton.addEventListener('click', (evt) => {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob([matbin.exportBinary().buffer], { type: 'application/octet-binary' }));
        anchor.download = (fileBaseNameForm.value === '' ? 'export' : fileBaseNameForm.value) + '.matbin';
        anchor.click();
    })

    exportJSONButton.addEventListener('click', (evt) => {
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(new Blob([matbin.toJSON()], { type: 'application/json' }));
        anchor.download = (fileBaseNameForm.value === '' ? 'export' : fileBaseNameForm.value) + '.json';
        anchor.click();
    })

    shaderPathForm.addEventListener('change', (evt) => {
        matbin.setShaderPath(shaderPathForm.value);
    });

    xmlPathForm.addEventListener('change', (evt) => {
        matbin.setXmlPath(xmlPathForm.value);
    });

    addParameterButton.addEventListener('click', (evt) => {
        const basename = 'newParam';
        const regexp = new RegExp(`^${basename}\\d+$`);
        const existNames = matbin.getParameters().map(v => v.name).filter(v => regexp.test(v)).sort((a, b) => parseInt(a.replace(basename, '')) - parseInt(b.replace(basename, '')));
        const name = existNames.length ? `${basename}${parseInt(existNames[existNames.length - 1].replace(basename, '')) + 1}` : `${basename}0`;
        const type = 0;
        const values = [0];
        const param = {
            name,
            type,
            values
        };
        matbin.addParameter(name, type, values);
        const tbody = parameterTable.tBodies.length ? parameterTable.tBodies[parameterTable.tBodies.length - 1] : parameterTable.appendChild(document.createElement('tbody'));
        const tr = tbody.appendChild(document.createElement('tr'));
        addParameterRow(tr, param);
    });

    addTextureButton.addEventListener('click', (evt) => {
        const basename = 'newTextureType';
        const regexp = new RegExp(`^${basename}\\d+$`);
        const existNames = matbin.getTextures().map(v => v.type).filter(v => regexp.test(v)).sort((a, b) => parseInt(a.replace(basename, '')) - parseInt(b.replace(basename, '')));
        const type = existNames.length ? `${basename}${parseInt(existNames[existNames.length - 1].replace(basename, '')) + 1}` : `${basename}0`;
        const path = '';
        const floats = [0, 0];
        const texture = {
            type,
            path,
            floats
        }
        matbin.addTexture(type, { path, floats });
        const tbody = textureTable.tBodies.length ? textureTable.tBodies[textureTable.tBodies.length - 1] : textureTable.appendChild(document.createElement('tbody'));
        const tr = tbody.appendChild(document.createElement('tr'));
        addTextureRow(tr, texture);
    });

    fileBaseNameForm.addEventListener('change', (() => {
        let prevValue = fileBaseNameForm.value;
        return (evt) => {
            if (fileBaseNameForm.value === '') {
                fileBaseNameForm.value = prevValue;
            }
            prevValue = fileBaseNameForm.value;
        }
    })())

    updateDOM();
});