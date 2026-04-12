export async function GET(req) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return Response.json({ photos: [] })

  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) {
    return Response.json({ photos: [], error: 'UNSPLASH_ACCESS_KEY missing' }, { status: 500 })
  }

  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&per_page=8`
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  })

  let data
  try {
    data = await res.json()
  } catch {
    return Response.json({ photos: [], error: 'Unsplash 응답 파싱 실패' }, { status: 502 })
  }

  if (!res.ok) {
    const errList = data?.errors
    const msg =
      (Array.isArray(errList) ? errList.map(String).join('; ') : errList && String(errList)) ||
      data?.error ||
      (typeof data === 'string' ? data : null) ||
      `Unsplash 오류 (HTTP ${res.status})`
    return Response.json({ photos: [], error: msg }, { status: 502 })
  }

  const photos = (data.results || [])
    .map((p) => {
      const small = p.urls?.small
      const regular = p.urls?.regular
      if (!small && !regular) return null
      return {
        id: p.id,
        thumb: small || regular,
        regular: regular || small,
        credit: p.user?.name ?? '',
      }
    })
    .filter(Boolean)

  return Response.json({ photos })
}
