// Vercel Serverless: Audio export (client-side cutting + stitching)
// This endpoint just provides the cut list -- actual cutting happens client-side
// using Web Audio API since Vercel functions don't have FFmpeg

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { sections, fillerWords, pauses, settings } = req.body || {};
  if (!sections) return res.status(400).json({ error: "Missing sections" });

  // Build ordered cut list from selected takes, removing fillers and pauses
  const cuts = [];
  const removedFillers = (fillerWords || []).filter(f => f.removed !== false);
  const removedPauses = (pauses || []).filter(p => p.removed !== false);

  for (const section of sections) {
    const selectedTake = section.takes?.find(t => t.is_selected);
    if (!selectedTake) continue;

    let { start, end } = selectedTake;
    // Build keep-regions within this take by removing fillers and pauses
    const removals = [
      ...removedFillers.filter(f => f.start >= start && f.end <= end),
      ...removedPauses.filter(p => p.start >= start && p.end <= end),
    ].sort((a, b) => a.start - b.start);

    if (removals.length === 0) {
      cuts.push({ start, end, section_id: section.section_id });
    } else {
      let cursor = start;
      for (const r of removals) {
        if (r.start > cursor) {
          cuts.push({ start: cursor, end: r.start, section_id: section.section_id });
        }
        cursor = r.end;
      }
      if (cursor < end) {
        cuts.push({ start: cursor, end, section_id: section.section_id });
      }
    }
  }

  return res.status(200).json({
    cuts,
    settings: {
      bitrate: settings?.bitrate || "192k",
      normalize: settings?.normalize !== false,
      noiseGate: settings?.noiseGate || false,
    },
  });
}
