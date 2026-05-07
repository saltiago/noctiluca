export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password, type, content, attribution, caption, date, imageData, imageType } = req.body;

  // Check password
  if (password !== process.env.POST_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'Server configuration missing' });
  }

  try {
    let finalContent = content;

    // If there's image data, upload to Cloudinary first
    if (imageData && imageType === 'image') {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

      const formData = new URLSearchParams();
      formData.append('file', imageData);
      formData.append('upload_preset', uploadPreset);

      const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
      });

      const cloudData = await cloudRes.json();
      if (!cloudData.secure_url) {
        return res.status(500).json({ error: 'Image upload failed' });
      }
      finalContent = cloudData.secure_url;
    }

    // Get current posts.json from GitHub
    const fileRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/posts.json`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    const fileData = await fileRes.json();
    const currentPosts = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf8'));

    // Create new post
    const newPost = {
      id: Date.now().toString(),
      type,
      content: finalContent,
      date: date || new Date().toISOString().split('T')[0],
    };

    if (attribution) newPost.attribution = attribution;
    if (caption) newPost.caption = caption;

    // Prepend new post
    const updatedPosts = [newPost, ...currentPosts];

    // Write back to GitHub
    const updateRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/posts.json`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add ${type} post`,
          content: Buffer.from(JSON.stringify(updatedPosts, null, 2)).toString('base64'),
          sha: fileData.sha,
        }),
      }
    );

    if (!updateRes.ok) {
      const err = await updateRes.json();
      return res.status(500).json({ error: 'GitHub write failed', detail: err });
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
