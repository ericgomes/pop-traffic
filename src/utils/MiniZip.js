class MiniZip {
  constructor() {
    this.entries = [];
    this.encoder = new TextEncoder();
  }

  add(name, content) {
    const data = typeof content === 'string' ? this.encoder.encode(content) : content;
    this.entries.push({ name: this.encoder.encode(name), data: data, crc: MiniZip.crc32(data) });
  }

  build() {
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of this.entries) {
      const local = this._localHeader(entry);
      chunks.push(local, entry.data);
      central.push(this._centralHeader(entry, offset));
      offset += local.length + entry.data.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for (const c of central) {
      chunks.push(c);
      centralSize += c.length;
    }
    chunks.push(this._endRecord(central.length, centralSize, centralStart));

    return this._concat(chunks);
  }

  _localHeader(entry) {
    const buf = new Uint8Array(30 + entry.name.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint32(14, entry.crc, true);
    dv.setUint32(18, entry.data.length, true);
    dv.setUint32(22, entry.data.length, true);
    dv.setUint16(26, entry.name.length, true);
    dv.setUint16(28, 0, true);
    buf.set(entry.name, 30);
    return buf;
  }

  _centralHeader(entry, offset) {
    const buf = new Uint8Array(46 + entry.name.length);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, 0, true);
    dv.setUint16(14, 0, true);
    dv.setUint32(16, entry.crc, true);
    dv.setUint32(20, entry.data.length, true);
    dv.setUint32(24, entry.data.length, true);
    dv.setUint16(28, entry.name.length, true);
    dv.setUint16(30, 0, true);
    dv.setUint16(32, 0, true);
    dv.setUint16(34, 0, true);
    dv.setUint16(36, 0, true);
    dv.setUint32(38, 0, true);
    dv.setUint32(42, offset, true);
    buf.set(entry.name, 46);
    return buf;
  }

  _endRecord(count, size, offset) {
    const buf = new Uint8Array(22);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, 0x06054b50, true);
    dv.setUint16(4, 0, true);
    dv.setUint16(6, 0, true);
    dv.setUint16(8, count, true);
    dv.setUint16(10, count, true);
    dv.setUint32(12, size, true);
    dv.setUint32(16, offset, true);
    dv.setUint16(20, 0, true);
    return buf;
  }

  _concat(chunks) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const c of chunks) {
      out.set(c, pos);
      pos += c.length;
    }
    return out;
  }

  static crc32(bytes) {
    if (!MiniZip.TABLE) MiniZip._buildTable();
    let crc = -1;
    for (let i = 0; i < bytes.length; i++) {
      crc = (crc >>> 8) ^ MiniZip.TABLE[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ -1) >>> 0;
  }

  static _buildTable() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    MiniZip.TABLE = table;
  }
}
