/* Dev only. A static file server with the right MIME types and Range support,
   because the badge is ES modules (which won't load over file://) and the video
   background has to be seekable — a <video> can only seek a source whose server
   answers Range requests with 206. Nothing here ships to production; the folder
   is plain static hosting, and any real host does both of these already. */
import { createServer } from 'node:http';
import { stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('./', import.meta.url));
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2',
};

/* fs.createReadStream owns and auto-closes its own descriptor. A FileHandle from
   fs/promises.open() does not, and Node 25 turns a garbage-collected open handle
   into a fatal error — which killed this server the first time a video was
   streamed. Tearing the stream down when the client disconnects matters too:
   browsers abandon range requests constantly while seeking. */
const send = (res, stream) => {
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroyed || res.destroy());
  stream.pipe(res);
};

createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);

  /* Dev-only: the page posts its own rendered poster back so the social preview
     image is the real empty state rather than a mock-up that drifts from it.
     One fixed destination, no path from the request, and the server is bound to
     the loopback interface — this writes nothing else, from nowhere else. */
  if (req.method === 'POST' && path === '/__og') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const url = Buffer.concat(chunks).toString();
    const b64 = url.slice(url.indexOf(',') + 1);
    await writeFile(join(ROOT, 'assets/img/og-image.png'), Buffer.from(b64, 'base64'));
    return res.writeHead(200).end('saved');
  }
  const file = join(ROOT, normalize(path === '/' ? '/index.html' : path));
  if (!file.startsWith(ROOT)) return res.writeHead(403).end('forbidden');

  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');

    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };

    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
      if (start >= info.size || start > end) {
        res.writeHead(416, { 'content-range': `bytes */${info.size}` }).end();
        return;
      }
      res.writeHead(206, {
        ...headers,
        'content-range': `bytes ${start}-${end}/${info.size}`,
        'content-length': end - start + 1,
      });
      send(res, createReadStream(file, { start, end }));
      return;
    }

    res.writeHead(200, { ...headers, 'content-length': info.size });
    send(res, createReadStream(file));
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(8831, '127.0.0.1', () => console.log('fi-roi on http://localhost:8831'));
