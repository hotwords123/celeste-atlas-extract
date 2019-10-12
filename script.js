
'use strict';

const fs = require('fs-extra');
const Path = require('path');

const saveDir = Path.join(__dirname, 'result');

const $ = sel => document.querySelector(sel);

let canvas = document.createElement('canvas');
let ctx = canvas.getContext('2d');
let i_path = $('#i-path');
let btn_ok = $('#btn-ok');
let t_status = $('#t_status');

function toArrayBuffer(buffer) {
    return Uint8Array.from(buffer).buffer;
}

function toBuffer(arraybuffer) {
    return Buffer.from(arraybuffer);
}

function canvasToBlob(canvas, ...arg) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, ...arg);
    });
}

function readBlob(blob) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.readAsArrayBuffer(blob);
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
    });
}

function updateStatus(text) {
    t_status.innerText = text;
}

async function extractAtlas(buffer) {
    const [width, height] = new Uint32Array(buffer.slice(0, 8));
    canvas.width = width;
    canvas.height = height;

    const flag = new Uint8Array(buffer.slice(8, 9))[0];
    const flag_alpha = flag & 1;

    console.log(`size: ${width}x${height} = ${width * height} flag: ${flag}`);

    let imageData = ctx.createImageData(width, height);

    let index = 0;
    const addPixels = (cnt, r, g, b, a) => {
        if (!cnt) throw new Error('count should not be zero');
        while (cnt--) {
            imageData.data[index++] = r;
            imageData.data[index++] = g;
            imageData.data[index++] = b;
            imageData.data[index++] = a;
        }
    };

    let data = new Uint8Array(buffer.slice(9));
    let total = 0;
    for (let i = 0; i < data.length; ) {
        total += data[i];
        if (flag_alpha) {
            if (0 === data[i + 1]) {
                addPixels(data[i], 0, 0, 0, 0);
                i += 2;
            } else {
                addPixels(data[i], ...data.slice(i + 1, i + 5).reverse());
                i += 5;
            }
        } else {
            addPixels(data[i], ...data.slice(i + 1, i + 4).reverse(), 255);
            i += 4;
        }
    }
    if (total !== width * height) {
        throw new Error(`size does not match: ${width}x${height} = ${width * height} != ${total}`);
    }
    ctx.putImageData(imageData, 0, 0);

    return await canvasToBlob(canvas, 'image/png');
}

async function scanPath(path) {
    let files = await fs.readdir(path);
    let result = [];
    for (let file of files) {
        let fullPath = Path.join(path, file);
        let stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
            let subFiles = await scanPath(fullPath);
            subFiles.forEach(sub => {
                result.push(Path.join(file, sub));
            });
        } else {
            if (file.endsWith('.data')) {
                result.push(file);
            }
        }
    }
    return result;
}

async function ensureDirs(base, files) {
    let set = new Set(files.map(file => Path.dirname(file)));
    for (let dir of set) {
        await fs.ensureDir(Path.join(base, dir));
    }
}

btn_ok.addEventListener('click', async function() {
    btn_ok.disabled = true;
    try {
        let path = i_path.value;
        if (!path) {
            i_path.focus();
            return;
        }
        if (!await fs.pathExists(path)) {
            throw new Error('path does not exist');
        }
        let startTime = Date.now();
        updateStatus('Scanning files...');
        let files = await scanPath(path);
        updateStatus('Creating directories...');
        await ensureDirs(saveDir, files);
        for (let i = 0; i < files.length; ++i) {
            let file = files[i];
            updateStatus(`Extracting file: ${file} (${i + 1}/${files.length})`);
            let fullPath = Path.join(path, file);
            let buffer = toArrayBuffer(await fs.readFile(fullPath));
            let blob = await extractAtlas(buffer);
            let result = toBuffer(await readBlob(blob));
            let saveFile = Path.join(saveDir, file.replace(/\.data$/, '.png'));
            await fs.ensureDir(Path.dirname(saveFile));
            await fs.writeFile(saveFile, result);
        }
        updateStatus(`Done in ${((Date.now() - startTime) / 1000).toFixed(2)}s.`);
    } catch (err) {
        alert(err.message);
        console.error(err);
    } finally {
        btn_ok.disabled = false;
    }
}, false);
