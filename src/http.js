export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export async function jsonBody(req, maxBytes = 262144) {
  if (!(req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase().endsWith('/json'))
    throw new HttpError(415, 'CONTENT_TYPE', 'Send application/json.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes)
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Request is limited to 256 KiB.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error();
    return value;
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Provide a JSON object.');
  }
}

export function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
