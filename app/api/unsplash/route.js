export async function GET(req) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return Response.json({ photos: [] })

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) {
    return Response.json({ photos: [], error: 'UNSPLASH_ACCESS_KEY missing' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=5&orientation=squarish`,
    { headers: { Authorization: `Client-ID ${key}` } },
  )
  const data = await res.json()
  const photos = (data.results || []).map((p) => ({
    id: p.id,
    thumb: p.urls.small,
    regular: p.urls.regular,
    credit: p.user?.name ?? '',
  }))
  return Response.json({ photos })
}
