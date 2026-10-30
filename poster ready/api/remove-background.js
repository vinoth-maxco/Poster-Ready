export const config = { api: { bodyParser: false } };

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'Background removal is not configured.' });

  try {
    const image = await readBody(req);
    if (!image.length || image.length > 15 * 1024 * 1024) {
      return res.status(400).json({ error: 'Use an image smaller than 15 MB.' });
    }

    const type = req.headers['content-type'] || 'image/jpeg';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
      return res.status(400).json({ error: 'Use a JPG, PNG or WebP image.' });
    }

    const form = new FormData();
    form.append('image_file', new Blob([image], { type }), 'participant-photo');
    form.append('size', 'auto');
    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('remove.bg failed', response.status, detail);
      return res.status(response.status).json({ error: 'Could not remove this photo background. Please try another photo.' });
    }

    const result = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(result);
  } catch (error) {
    console.error('remove-background error', error);
    return res.status(500).json({ error: 'Background removal failed. Please try again.' });
  }
}
