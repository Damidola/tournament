"""Remove contradictory final+abstract flags produced by dex2jar's InnerClasses metadata.

No methods, instructions, fields, or constant pool entries are changed.
"""
import struct
import sys
import zipfile

def normalize(data):
    b = bytearray(data)
    def u2(p): return struct.unpack_from('>H', b, p)[0]
    def u4(p): return struct.unpack_from('>I', b, p)[0]
    p, constants, count = 10, {}, u2(8)
    i = 1
    while i < count:
        tag, p = b[p], p + 1
        if tag == 1:
            size = u2(p); p += 2
            constants[i] = bytes(b[p:p + size]).decode('utf-8', errors='replace')
            p += size
        elif tag in (3, 4, 9, 10, 11, 12, 17, 18): p += 4
        elif tag in (5, 6): p += 8; i += 1
        elif tag in (7, 8, 16, 19, 20): p += 2
        elif tag == 15: p += 3
        else: raise ValueError(tag)
        i += 1
    changed = 0
    def clean_flag(offset):
        nonlocal changed
        value = u2(offset)
        if value & 0x10 and value & 0x400:
            struct.pack_into('>H', b, offset, value & ~0x400); changed += 1
    clean_flag(p)
    p += 6
    p += 2 + u2(p) * 2
    for _ in range(2):
        members = u2(p); p += 2
        for _ in range(members):
            attrs = u2(p + 6); p += 8
            for _ in range(attrs): p += 6 + u4(p + 2)
    attrs = u2(p); p += 2
    for _ in range(attrs):
        name, size = constants.get(u2(p)), u4(p + 2)
        p += 6
        if name == 'InnerClasses':
            for j in range(u2(p)): clean_flag(p + 2 + j * 8 + 6)
        p += size
    return bytes(b), changed

if __name__ == '__main__':
    changes = 0
    with zipfile.ZipFile(sys.argv[1]) as source, zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED) as target:
        for entry in source.infolist():
            data = source.read(entry)
            if entry.filename.endswith('.class'):
                data, count = normalize(data); changes += count
            target.writestr(entry, data)
    print('Normalized metadata flags:', changes)
