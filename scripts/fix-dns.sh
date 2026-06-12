#!/bin/bash
# Regenerates /etc/hosts entries for blocked services
# Uses TCP DNS (port 53) to bypass UDP DNS filtering
python3 << 'PYEOF'
import socket, struct, os

def resolve(domain):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(5)
    sock.connect(('8.8.8.8', 53))
    tid = 0x1234
    header = struct.pack('>HHHHHH', tid, 0x0100, 1, 0, 0, 0)
    body = b''
    for p in domain.split('.'): body += bytes([len(p)]) + p.encode()
    body += b'\x00\x00\x01\x00\x01'
    q = header + body
    sock.send(struct.pack('>H', len(q)) + q)
    raw_len = sock.recv(2)
    dlen = struct.unpack('>H', raw_len)[0]
    data = b''
    while len(data) < dlen:
        chunk = sock.recv(dlen - len(data))
        if not chunk: break
        data += chunk
    sock.close()
    ancount = struct.unpack('>H', data[6:8])[0]
    if ancount == 0: return []
    offset = 12
    while offset < len(data) and data[offset] != 0: offset += 1
    offset += 5
    ips = []
    for _ in range(ancount):
        if data[offset] & 0xC0: offset += 2
        else:
            while offset < len(data) and data[offset] != 0: offset += 1
            offset += 1
        rtype, rclass, ttl, rdlen = struct.unpack('>HHIH', data[offset:offset+10])
        offset += 10
        if rtype == 1 and rdlen == 4:
            ips.append('.'.join(str(b) for b in data[offset:offset+4]))
        offset += rdlen
    return ips

domains = [
    't.me', 'www.t.me', 'telegram.org', 'api.telegram.org',
    'reddit.com', 'www.reddit.com',
    'nitter.net', 'nitter.lacontrevoie.fr', 'nitter.kavin.rocks', 'nitter.pussthecat.org', 'twitter.skrep.eu',
    'inv.nadeko.net', 'yewtu.be', 'invidious.private.coffee', 'invidious.protokolla.fi',
    'www.googleapis.com', 'pastebin.com', 'www.pastebin.com',
    'twitter.com', 'www.twitter.com', 'x.com', 'www.x.com',
    'youtube.com', 'www.youtube.com',
]

# Read existing hosts, remove old block
with open('/etc/hosts', 'r') as f: hosts = f.read()
lines = [l for l in hosts.split('\n') if 'dns-bypass' not in l]
lines = [l for l in lines if not any(d in l.split()[-1:] for d in domains if l.strip())]

for domain in domains:
    ips = resolve(domain)
    if ips:
        lines.append(f'{ips[0]}\t{domain}')

lines.append('# === dns-bypass end ===')
with open('/etc/hosts', 'w') as f:
    f.write('\n'.join(lines) + '\n')
print(f'Added {len(domains)} domain entries to /etc/hosts')
PYEOF
