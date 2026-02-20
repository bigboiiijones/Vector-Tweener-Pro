import { saveAs } from 'file-saver';

export const saveTGA = (canvas: HTMLCanvasElement, filename: string) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // TGA Header (18 bytes)
    const header = new Uint8Array(18);
    header[2] = 2; // Uncompressed True-Color Image
    header[12] = width & 0xFF;
    header[13] = (width >> 8) & 0xFF;
    header[14] = height & 0xFF;
    header[15] = (height >> 8) & 0xFF;
    header[16] = 32; // 32-bit pixel depth (RGBA)
    header[17] = 0x20; // 8-bit alpha, top-left origin

    const totalPixels = width * height;
    const content = new Uint8Array(totalPixels * 4);

    // Canvas is RGBA. TGA 32-bit is usually BGRA.
    for (let i = 0; i < totalPixels; i++) {
        const offset = i * 4;
        content[offset] = data[offset + 2];     // Blue
        content[offset + 1] = data[offset + 1]; // Green
        content[offset + 2] = data[offset];     // Red
        content[offset + 3] = data[offset + 3]; // Alpha
    }

    const blob = new Blob([header, content], { type: 'image/x-tga' });
    saveAs(blob, filename);
};
