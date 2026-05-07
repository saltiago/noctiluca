export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, action, id, type, content, attribution, caption, date } = req.body;

  if (password !== process.env.POST_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Return Cloudinary config for direct browser upload
  if (action === 'cloudinary_config') {
    return res.status(200).json({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
    });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo  = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  try {
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/posts.json`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
    );
    const fileData = await fileRes.json();
    let posts = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    if (action === 'delete') {
      posts = posts.filter(p => p.id !== id);
    }

    if (action === 'create') {
      const newPost = { id: Date.now().toString(), type, content, date: date || new Date().toISOString().split('T')[0] };
      if (attribution) newPost.attribution = attribution;
      if (caption)     newPost.caption = caption;
      posts = [newPost, ...posts];
    }

    if (action === 'edit') {
      posts = posts.map(p => {
        if (p.id !== id) return p;
        const u = { ...p, type, date };
        if (content) u.content = content;
        if (attribution) u.attribution = attribution; else delete u.attribution;
        if (caption)     u.caption = caption;         else delete u.caption;
        return u;
      });
    }

    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/posts.json`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `${action} post`,
          content: Buffer.from(JSON.stringify(posts, null, 2)).toString('base64'),
          sha: fileData.sha,
        }),
      }
    );

    if (!updateRes.ok) {
      return res.status(500).json({ error: 'GitHub write failed', detail: await updateRes.json() });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
