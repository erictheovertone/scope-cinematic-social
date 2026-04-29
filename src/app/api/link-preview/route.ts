import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  if (!url) return NextResponse.json({ title: '', thumbnail_url: '', is_video: false, video_url: null });

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace('www.', '');

    // YouTube
    if (host === 'youtube.com' || host === 'youtu.be') {
      const videoIdMatch = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&\n?#]+)/);
      const videoId = videoIdMatch?.[1] || null;

      let title = '';
      let thumbnail_url = '';

      const oembed = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`).catch(() => null);
      if (oembed?.ok) {
        const data = await oembed.json();
        title = data.title || '';
      }

      if (videoId) {
        // Try high-res thumbnail first, fall back to hqdefault
        const maxres = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        const hq = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const check = await fetch(maxres, { method: 'HEAD' }).catch(() => null);
        thumbnail_url = (check?.ok && check.headers.get('content-length') !== '1097') ? maxres : hq;
      }

      return NextResponse.json({ title, thumbnail_url, is_video: true, video_url: url });
    }

    // Vimeo
    if (host === 'vimeo.com') {
      const oembed = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`);
      if (oembed.ok) {
        const data = await oembed.json();
        return NextResponse.json({ title: data.title || '', thumbnail_url: data.thumbnail_url || '', is_video: true, video_url: url });
      }
      return NextResponse.json({ title: '', thumbnail_url: '', is_video: true, video_url: url });
    }

    // Generic: fetch HTML and extract og tags
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScopeBot/1.0)' }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return NextResponse.json({ title: '', thumbnail_url: '', is_video: false, video_url: null });
    const html = await res.text();

    const titleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    const imageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);

    return NextResponse.json({
      title: titleMatch?.[1] || '',
      thumbnail_url: imageMatch?.[1] || '',
      is_video: false,
      video_url: null,
    });
  } catch {
    return NextResponse.json({ title: '', thumbnail_url: '', is_video: false, video_url: null });
  }
}
